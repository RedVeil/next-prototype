const TAURI_RESUMO_URL = "https://app.tauriagricola.com.br/api/relatorios/get-resumo"

export type TauriPayment = {
  movement_id: number
  payment_datetime: string
  amount: number
  movement_origin: string
  payment_type: string
  notes: string | null
  has_receipt: boolean
  receipt_url: string | null
}

export type TauriInvoice = {
  invoice_id: number
  invoice_number: number
  issue_datetime: string
  due_date: string
  payment_term_days: number
  payment_term_source: string
  contract_number: number | null
  payment_term_description: string
  customer_name: string
  invoice_amount: number
  payments: TauriPayment[]
}

type TauriDay = {
  date: string
  outbound_invoice_count: number
  outbound_invoice_total_amount: number
  invoices: TauriInvoice[]
}

type TauriResumo = {
  summary: {
    total_days: number
    total_outbound_invoices: number
    total_outbound_invoice_amount: number
  }
  days: TauriDay[]
}

export async function fetchTauriInvoices(apiKey: string): Promise<TauriInvoice[]> {
  const response = await fetch(TAURI_RESUMO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: "{}",
  })
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!response.ok) throw new Error(errorFromBody(response.status, body))
  const resumo = parseTauriResumo(body)
  if (!resumo) throw new Error("The Tauri report did not match the expected invoice shape.")
  return resumo.days.flatMap((day) => day.invoices)
}

export function receivedAmount(invoice: TauriInvoice): number {
  return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)
}

export function hasPayment(invoice: TauriInvoice): boolean {
  return receivedAmount(invoice) > 0
}

export function tauriDocumentId(invoiceId: number): string {
  return `tauri:${invoiceId}`
}

function parseTauriResumo(body: unknown): TauriResumo | null {
  if (!isRecord(body) || !isRecord(body.summary) || !Array.isArray(body.days)) return null
  const totalDays = asNumber(body.summary.total_days)
  const totalInvoices = asNumber(body.summary.total_outbound_invoices)
  const totalAmount = asNumber(body.summary.total_outbound_invoice_amount)
  if (totalDays === null || totalInvoices === null || totalAmount === null) return null

  const days: TauriDay[] = []
  for (const day of body.days) {
    const parsed = parseDay(day)
    if (!parsed) return null
    days.push(parsed)
  }
  return {
    summary: {
      total_days: totalDays,
      total_outbound_invoices: totalInvoices,
      total_outbound_invoice_amount: totalAmount,
    },
    days,
  }
}

function parseDay(value: unknown): TauriDay | null {
  if (!isRecord(value) || !Array.isArray(value.invoices)) return null
  const date = asString(value.date)
  const count = asNumber(value.outbound_invoice_count)
  const total = asNumber(value.outbound_invoice_total_amount)
  if (!date || count === null || total === null) return null
  const invoices: TauriInvoice[] = []
  for (const invoice of value.invoices) {
    const parsed = parseInvoice(invoice)
    if (!parsed) return null
    invoices.push(parsed)
  }
  return {
    date,
    outbound_invoice_count: count,
    outbound_invoice_total_amount: total,
    invoices,
  }
}

function parseInvoice(value: unknown): TauriInvoice | null {
  if (!isRecord(value) || !Array.isArray(value.payments)) return null
  const invoiceId = asNumber(value.invoice_id)
  const invoiceNumber = asNumber(value.invoice_number)
  const issueDatetime = asString(value.issue_datetime)
  const dueDate = asString(value.due_date)
  const termDays = asNumber(value.payment_term_days)
  const termSource = asString(value.payment_term_source)
  const termDescription = asString(value.payment_term_description)
  const customerName = asString(value.customer_name)
  const amount = asNumber(value.invoice_amount)
  const contract = value.contract_number === null || value.contract_number === undefined ? null : asNumber(value.contract_number)
  if (
    invoiceId === null ||
    invoiceNumber === null ||
    !issueDatetime ||
    !dueDate ||
    termDays === null ||
    !termSource ||
    !termDescription ||
    !customerName ||
    amount === null ||
    (value.contract_number != null && contract === null)
  ) {
    return null
  }
  const payments: TauriPayment[] = []
  for (const payment of value.payments) {
    const parsed = parsePayment(payment)
    if (!parsed) return null
    payments.push(parsed)
  }
  return {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    issue_datetime: issueDatetime,
    due_date: dueDate,
    payment_term_days: termDays,
    payment_term_source: termSource,
    contract_number: contract,
    payment_term_description: termDescription,
    customer_name: customerName,
    invoice_amount: amount,
    payments,
  }
}

function parsePayment(value: unknown): TauriPayment | null {
  if (!isRecord(value)) return null
  const movementId = asNumber(value.movement_id)
  const paymentDatetime = asString(value.payment_datetime)
  const amount = asNumber(value.amount)
  const origin = asLabel(value.movement_origin)
  const type = asString(value.payment_type)
  if (movementId === null || !paymentDatetime || amount === null || !origin || !type) return null
  if (typeof value.has_receipt !== "boolean") return null
  return {
    movement_id: movementId,
    payment_datetime: paymentDatetime,
    amount,
    movement_origin: origin,
    payment_type: type,
    notes: value.notes === null ? null : asString(value.notes),
    has_receipt: value.has_receipt,
    receipt_url: value.receipt_url === null ? null : asString(value.receipt_url),
  }
}

function errorFromBody(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) return `Tauri report returned HTTP ${status}. ${body.trim()}`
  if (isRecord(body)) {
    const message = asString(body.message) ?? asString(body.error)
    if (message) return `Tauri report returned HTTP ${status}. ${message}`
  }
  return `Tauri report returned HTTP ${status}.`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asLabel(value: unknown): string | null {
  return asString(value) ?? (asNumber(value) === null ? null : String(value))
}
