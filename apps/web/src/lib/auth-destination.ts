import type { SupabaseClient } from "@supabase/supabase-js"

export async function destinationPath(supabase: SupabaseClient, userId: string) {
  const profile = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle()
  const role = profile.data?.role
  if (role === "admin") return "/admin"
  if (role === "investor") {
    const investor = await supabase.from("investors").select("id").eq("profile_id", userId).maybeSingle()
    return investor.data ? "/investor/dashboard" : "/investor/onboarding"
  }
  const company = await supabase.from("companies").select("id").eq("profile_id", userId).maybeSingle()
  return company.data ? "/seller/dashboard" : "/seller/onboarding"
}
