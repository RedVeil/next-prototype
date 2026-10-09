"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "./supabase/server"
import { createServiceClient } from "./supabase/service"

export type AcceptOfferResult = { ok: true } | { ok: false; error: string }

export async function acceptInvoiceOffer(invoiceId: string): Promise<AcceptOfferResult> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return { ok: false, error: "Not signed in" }

    const service = createServiceClient()
    const invoice = await service
      .from("invoices")
      .select("id, company_id, sale_status, status")
      .eq("id", invoiceId)
      .maybeSingle()
    if (invoice.error) return { ok: false, error: invoice.error.message }
    if (!invoice.data) return { ok: false, error: "Invoice not found" }
    if (invoice.data.sale_status === "sold" || invoice.data.status === "accepted") {
      return { ok: false, error: "This offer is already accepted." }
    }

    const company = await service
      .from("companies")
      .select("profile_id, application_status, access_status")
      .eq("id", invoice.data.company_id)
      .maybeSingle()
    if (company.error) return { ok: false, error: company.error.message }
    if (!company.data || company.data.profile_id !== data.user.id) {
      return { ok: false, error: "This invoice belongs to another company." }
    }
    if (company.data.application_status !== "accepted" || company.data.access_status === "stopped") {
      return { ok: false, error: "This company cannot accept offers." }
    }

    const offer = await service.from("offers").select("id").eq("invoice_id", invoiceId).eq("status", "open").maybeSingle()
    if (offer.error) return { ok: false, error: offer.error.message }
    if (!offer.data) return { ok: false, error: "There is no open offer to accept." }

    const accepted = await service.from("offers").update({ status: "accepted" }).eq("id", offer.data.id).eq("status", "open")
    if (accepted.error) return { ok: false, error: accepted.error.message }
    const updated = await service
      .from("invoices")
      .update({ status: "accepted", eligible_for_matching: false })
      .eq("id", invoiceId)
    if (updated.error) return { ok: false, error: updated.error.message }

    revalidatePath("/seller/invoices")
    revalidatePath("/seller/dashboard")
    revalidatePath(`/admin/companies/${invoice.data.company_id}`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" }
  }
}
