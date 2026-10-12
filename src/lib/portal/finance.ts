import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  customer_id: string;
}

export interface PaymentRow {
  id: string;
  payment_method: string;
  amount_cents: number;
  currency: string;
  status: string;
  received_at: string;
  reference: string | null;
}

export interface AllocationRow {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount_cents: number;
}

export interface ReceiptRow {
  id: string;
  payment_id: string;
  receipt_number: string;
  issued_at: string;
}

export interface InvoiceWithBalance extends InvoiceRow {
  paid_cents: number;
  outstanding_cents: number;
}

export interface CustomerFinancials {
  invoices: InvoiceWithBalance[];
  payments: PaymentRow[];
  allocations: AllocationRow[];
  receipts: ReceiptRow[];
  /** Sum of outstanding_cents over issued, non-void invoices. */
  outstandingCents: number;
  /** The database's own figure, kept for reconciliation (it also counts draft invoices). */
  rpcOutstandingCents: number;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Loads the signed-in customer's financial records through
 * public.get_customer_statement() - the sanctioned customer-facing path
 * (BUSINESS_SCHEMA Decision 9). It is SECURITY INVOKER, so RLS on
 * invoices/payments/allocations/receipts is still the backstop. Customers
 * have no policy on ledger_entries/financial_transactions by design, so the
 * ledger is not queried directly from the portal.
 *
 * Draft invoices are excluded: they have not been issued to the customer.
 * (The SQL function's own outstanding_balance_cents does include drafts -
 * see PORTAL_CUSTOMER_REVIEW.md. It is returned as rpcOutstandingCents.)
 */
export async function loadCustomerFinancials(
  supabase: Db,
): Promise<{ data: CustomerFinancials | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_customer_statement");
  if (error) return { data: null, error: error.message };

  const payload = (data ?? {}) as Record<string, unknown>;
  const allocations = rows<AllocationRow>(payload.allocations);

  const paidByInvoice = new Map<string, number>();
  for (const a of allocations) {
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + Number(a.amount_cents));
  }

  const invoices: InvoiceWithBalance[] = rows<InvoiceRow>(payload.invoices)
    .filter((i) => i.status !== "draft")
    .map((i) => {
      const paid = paidByInvoice.get(i.id) ?? 0;
      return {
        ...i,
        total_cents: Number(i.total_cents),
        subtotal_cents: Number(i.subtotal_cents),
        tax_cents: Number(i.tax_cents),
        paid_cents: paid,
        outstanding_cents: i.status === "void" ? 0 : Math.max(Number(i.total_cents) - paid, 0),
      };
    });

  return {
    error: null,
    data: {
      invoices,
      payments: rows<PaymentRow>(payload.payments),
      allocations,
      receipts: rows<ReceiptRow>(payload.receipts),
      outstandingCents: invoices.reduce((sum, i) => sum + i.outstanding_cents, 0),
      rpcOutstandingCents: Number(payload.outstanding_balance_cents ?? 0),
    },
  };
}

export interface StatementLine {
  key: string;
  date: string;
  description: string;
  debit_cents: number;
  credit_cents: number;
  balance_cents: number;
}

export interface Statement {
  openingCents: number;
  lines: StatementLine[];
  closingCents: number;
  /** Confirmed payments not yet applied to any invoice - shown as a note, not in the balance. */
  unappliedPaymentsCents: number;
}

/**
 * Builds a statement of account from the customer's real invoices and
 * payment allocations: invoices are debits, allocations are credits dated
 * at the payment's received date. The closing balance therefore equals the
 * sum of outstanding invoice balances shown elsewhere in the portal.
 * `from`/`to` are optional YYYY-MM-DD bounds; activity before `from` rolls
 * into the opening balance.
 */
export function buildStatement(
  fin: CustomerFinancials,
  from?: string,
  to?: string,
): Statement {
  const invoiceById = new Map(fin.invoices.map((i) => [i.id, i]));
  const paymentById = new Map(fin.payments.map((p) => [p.id, p]));

  type Raw = { key: string; date: string; description: string; debit: number; credit: number; order: number };
  const raw: Raw[] = [];

  for (const inv of fin.invoices) {
    if (inv.status === "void") continue;
    raw.push({
      key: `inv-${inv.id}`,
      date: inv.issue_date,
      description: `Invoice ${inv.invoice_number} (due ${inv.due_date})`,
      debit: inv.total_cents,
      credit: 0,
      order: 0,
    });
  }

  for (const alloc of fin.allocations) {
    const inv = invoiceById.get(alloc.invoice_id);
    const pay = paymentById.get(alloc.payment_id);
    if (!inv || !pay || inv.status === "void") continue;
    const how = pay.payment_method.replace(/_/g, " ");
    raw.push({
      key: `alloc-${alloc.id}`,
      date: pay.received_at.slice(0, 10),
      description: `Payment (${how}${pay.reference ? `, ref ${pay.reference}` : ""}) applied to ${inv.invoice_number}`,
      debit: 0,
      credit: Number(alloc.amount_cents),
      order: 1,
    });
  }

  raw.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.key.localeCompare(b.key));

  let running = 0;
  let opening = 0;
  const lines: StatementLine[] = [];
  for (const r of raw) {
    const before = from ? r.date < from : false;
    const after = to ? r.date > to : false;
    running += r.debit - r.credit;
    if (before) {
      opening = running;
      continue;
    }
    if (after) {
      running -= r.debit - r.credit;
      continue;
    }
    lines.push({
      key: r.key,
      date: r.date,
      description: r.description,
      debit_cents: r.debit,
      credit_cents: r.credit,
      balance_cents: running,
    });
  }

  const allocatedByPayment = new Map<string, number>();
  for (const a of fin.allocations) {
    allocatedByPayment.set(a.payment_id, (allocatedByPayment.get(a.payment_id) ?? 0) + Number(a.amount_cents));
  }
  const unapplied = fin.payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + Math.max(Number(p.amount_cents) - (allocatedByPayment.get(p.id) ?? 0), 0), 0);

  return { openingCents: opening, lines, closingCents: running, unappliedPaymentsCents: unapplied };
}
