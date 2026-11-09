/** Invoice financial-detail validation, not a bank-settlement guarantee.
 * Call ONLY after the authenticated Sandbox GET passed accepted-content checks.
 * Webhook names, browser JSON and manual/external records are not evidence here.
 */
export const SETTLEMENT_VERSION = "rightsreceipt-invoice-financial-v1" as const;
export type SettlementConclusion = "paid" | "fully_refunded" | "canceled" | "unpaid" | "review_required";
export interface FinancialTransaction {
  readonly id: string; readonly amountCents: number; readonly date: string;
}
export interface InvoiceSettlement {
  readonly version: typeof SETTLEMENT_VERSION;
  readonly providerStatus: string; readonly conclusion: SettlementConclusion;
  readonly reason: string; readonly amountCents: number;
  readonly paidCents: number | null; readonly refundedCents: number | null;
  readonly dueCents: number | null;
  readonly payments: readonly FinancialTransaction[]; readonly refunds: readonly FinancialTransaction[];
  readonly observedAt: string;
}
const issued = new WeakSet<object>();
const LIMIT = 1_000_000_000;
const STATUS = new Set(["DRAFT", "SENT", "SCHEDULED", "UNPAID", "SHARED", "PAID", "REFUNDED",
  "CANCELLED", "AUTO_CANCELLED", "PARTIALLY_PAID", "PARTIALLY_REFUNDED", "PAYMENT_PENDING",
  "MARKED_AS_PAID", "MARKED_AS_REFUNDED", "PAID_EXTERNAL", "REFUNDED_EXTERNAL"]);
function record(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** USD conversion never rounds, accepts exponent notation, or converts via floats. */
export function settlementCents(v: unknown): number {
  if (!record(v) || v.currency_code !== "USD" || typeof v.value !== "string"
    || !/^(0|[1-9]\d{0,7})(?:\.\d{1,2})?$/u.test(v.value)) throw new Error("Invalid financial amount.");
  const [whole = "", fraction = ""] = v.value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > LIMIT) throw new Error("Invalid financial amount.");
  return cents;
}
export function validUtcInstant(v: string): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)) return false;
  const d = new Date(v); return Number.isFinite(d.getTime()) && d.toISOString() === v;
}
function dateOnly(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function transactionDate(r: Record<string, unknown>, refund: boolean, at: string): string {
  const day = r[refund ? "refund_date" : "payment_date"];
  const timestamp = refund ? undefined : r.payment_date_time;
  if (timestamp !== undefined) {
    if (typeof timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(timestamp)) throw new Error("Invalid transaction date.");
    const d = new Date(timestamp);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 19) !== timestamp.slice(0, 19)
      || d.toISOString() > at || (day !== undefined && day !== timestamp.slice(0, 10))) throw new Error("Invalid transaction date.");
    return d.toISOString().slice(0, 10);
  }
  if (!dateOnly(day) || day > at.slice(0, 10)) throw new Error("Invalid transaction date.");
  return day;
}
function group(v: unknown, refund: boolean, at: string) {
  if (v === undefined) return { total: 0, rows: [] as FinancialTransaction[] };
  if (!record(v) || !Array.isArray(v.transactions) || v.transactions.length > 50) throw new Error("Missing transaction details.");
  const total = settlementCents(v[refund ? "refund_amount" : "paid_amount"]);
  const seen = new Set<string>(); let sum = 0;
  const rows = v.transactions.map((r: unknown): FinancialTransaction => {
    if (!record(r) || r.type !== "PAYPAL" || !["PAYPAL", "CREDIT_CARD", "DEBIT_CARD"].includes(String(r.method))) {
      throw new Error("External or unrecognized payment.");
    }
    const id = r[refund ? "refund_id" : "payment_id"];
    if (typeof id !== "string" || !/^[A-Za-z0-9]{1,22}$/u.test(id) || seen.has(id)) throw new Error("Invalid transaction identity.");
    const amountCents = settlementCents(r.amount);
    if (!amountCents) throw new Error("Empty transaction.");
    seen.add(id); sum += amountCents;
    if (sum > LIMIT) throw new Error("Excess transaction total.");
    return Object.freeze({ id, amountCents, date: transactionDate(r, refund, at) });
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (sum !== total) throw new Error("Transaction total differs.");
  return { total, rows };
}
/** This brand proves local construction only; the injected GET transport is the trust boundary. */
export function isLocallyAssessedSettlement(v: unknown): v is InvoiceSettlement {
  return record(v) && issued.has(v);
}
export function assessInvoiceSettlement(raw: unknown, amountCents: number, observedAt: string): InvoiceSettlement {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > LIMIT || !validUtcInstant(observedAt)) {
    throw new Error("Invalid settlement context.");
  }
  const status = record(raw) && typeof raw.status === "string" && STATUS.has(raw.status) ? raw.status : "UNKNOWN";
  let paidCents: number | null = null, refundedCents: number | null = null, dueCents: number | null = null;
  let payments: readonly FinancialTransaction[] = [], refunds: readonly FinancialTransaction[] = [];
  let conclusion: SettlementConclusion = "review_required", reason = "financial_details_invalid";
  try {
    if (!record(raw) || settlementCents(raw.amount) !== amountCents) throw new Error("Invalid amount.");
    dueCents = settlementCents(raw.due_amount);
    if (raw.effective_invoice_total !== undefined && settlementCents(raw.effective_invoice_total) !== amountCents) throw new Error("Conditional total.");
    if (raw.effective_due_amount !== undefined && settlementCents(raw.effective_due_amount) !== dueCents) throw new Error("Conditional due.");
    if (raw.gratuity !== undefined && settlementCents(raw.gratuity) !== 0) throw new Error("Gratuity not supported.");
    if (record(raw.configuration) && raw.configuration.has_conditional_rule === true) throw new Error("Conditional invoice.");
    const p = group(raw.payments, false, observedAt), r = group(raw.refunds, true, observedAt);
    if (r.rows.some(refund => p.rows.some(payment => payment.id === refund.id))) throw new Error("Reused identity.");
    if (p.total > amountCents || r.total > p.total) throw new Error("Unbalanced invoice.");
    if (r.rows.length && (!p.rows.length || r.rows.some(refund => refund.date < p.rows.reduce((min, x) => x.date < min ? x.date : min, p.rows[0]!.date)))) {
      throw new Error("Refund precedes payment.");
    }
    paidCents = p.total; refundedCents = r.total; payments = p.rows; refunds = r.rows;
    if (status === "PAID" && p.total === amountCents && r.total === 0 && dueCents === 0) {
      conclusion = "paid"; reason = "paypal_payment_totals_match";
    } else if (status === "REFUNDED" && p.total === amountCents && r.total === amountCents && dueCents === 0) {
      conclusion = "fully_refunded"; reason = "paypal_full_refund_totals_match";
    } else if (["CANCELLED", "AUTO_CANCELLED"].includes(status) && p.total === 0 && r.total === 0
      && (dueCents === 0 || dueCents === amountCents)) {
      conclusion = "canceled"; reason = "unpaid_invoice_canceled";
    } else if (["DRAFT", "SENT", "UNPAID", "SHARED", "SCHEDULED"].includes(status)
      && p.total === 0 && r.total === 0 && dueCents === amountCents) {
      conclusion = "unpaid"; reason = "no_settled_payment";
    } else { reason = "partial_pending_external_or_conflicting"; }
  } catch { /* Incomplete, external or conflicting detail never becomes authority. */ }
  const assessment: InvoiceSettlement = Object.freeze({ version: SETTLEMENT_VERSION, providerStatus: status,
    conclusion, reason, amountCents, paidCents, refundedCents, dueCents,
    payments: Object.freeze([...payments]), refunds: Object.freeze([...refunds]), observedAt });
  issued.add(assessment); return assessment;
}
