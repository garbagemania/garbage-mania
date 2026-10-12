import { todayNairobi } from "@/lib/portal/dates";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole } from "@/lib/auth/rbac";
import { untyped } from "../_lib";

/**
 * CSV exports. Every row is read through the caller's own RLS-scoped session
 * (finance/admin/super_admin only), straight from the database.
 */
export const dynamic = "force-dynamic";

const iso = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 20000;
type Row = Record<string, unknown>;
type Cell = string | number | null | undefined;

/** Neutralise spreadsheet formula injection, then quote. */
function cell(v: Cell): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const kes = (cents: unknown) => (Number(cents ?? 0) / 100).toFixed(2);
const nested = (r: Row, key: string): Row => {
  const v = r[key];
  return (Array.isArray(v) ? v[0] : v) as Row ?? {};
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    requireStaffRole(user, ["super_admin", "admin", "finance"]);
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const type = p.get("type") ?? "";
  const from = iso.test(p.get("from") ?? "") ? (p.get("from") as string) : "1970-01-01";
  const to = iso.test(p.get("to") ?? "") ? (p.get("to") as string) : "2999-12-31";
  const db = untyped(createSupabaseServerClient());
  const title = `GARBAGE MANIA SERVICES LTD`;
  const out: Cell[][] = [];
  let header: string[] = [];
  let name = type;

  if (type === "revenue") {
    const { data, error } = await db
      .from("invoice_items")
      .select("description, amount_cents, vat_cents, line_total_cents, invoices!inner(invoice_number, issue_date, status, customers(display_name))")
      .gte("invoices.issue_date", from).lte("invoices.issue_date", to)
      .not("invoices.status", "in", "(draft,void)")
      .limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    header = ["Invoice date", "Customer", "Invoice", "Service", "Subtotal (KES)", "VAT (KES)", "Total (KES)"];
    for (const r of (data ?? []) as Row[]) {
      const inv = nested(r, "invoices");
      out.push([String(inv.issue_date), String(nested(inv, "customers").display_name ?? ""), String(inv.invoice_number), String(r.description), kes(r.amount_cents), kes(r.vat_cents), kes(r.line_total_cents)]);
    }
  } else if (type === "payments") {
    const { data, error } = await db
      .from("payments")
      .select("received_at, payment_method, reference, internal_reference, amount_cents, status, customers(display_name)")
      .gte("received_at", `${from}T00:00:00+03:00`).lte("received_at", `${to}T23:59:59+03:00`)
      .order("received_at").limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    header = ["Received", "Customer", "Method", "Reference", "Internal ref", "Amount (KES)", "Status"];
    for (const r of (data ?? []) as Row[]) out.push([String(r.received_at), String(nested(r, "customers").display_name ?? ""), String(r.payment_method), r.reference as Cell, String(r.internal_reference), kes(r.amount_cents), String(r.status)]);
  } else if (type === "receivables") {
    const { data, error } = await db
      .from("invoice_balances")
      .select("invoice_number, customer_id, issue_date, due_date, total_cents, paid_cents, credited_cents, outstanding_cents, days_overdue")
      .in("status", ["issued", "partially_paid", "overdue"]).gt("outstanding_cents", 0).order("due_date").limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = Array.from(new Set(((data ?? []) as Row[]).map((r) => String(r.customer_id))));
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: cs } = await db.from("customers").select("id, display_name").in("id", ids.slice(i, i + 200));
      for (const c of (cs ?? []) as Row[]) names.set(String(c.id), String(c.display_name));
    }
    header = ["Customer", "Invoice", "Invoice date", "Due date", "Total (KES)", "Paid (KES)", "Credited (KES)", "Outstanding (KES)", "Days overdue"];
    for (const r of (data ?? []) as Row[]) out.push([names.get(String(r.customer_id)) ?? "", String(r.invoice_number), String(r.issue_date), String(r.due_date), kes(r.total_cents), kes(r.paid_cents), kes(r.credited_cents), kes(r.outstanding_cents), Number(r.days_overdue)]);
  } else if (type === "vat") {
    const { data, error } = await db
      .from("invoices")
      .select("invoice_number, issue_date, subtotal_cents, tax_cents, total_cents, customers(display_name)")
      .gte("issue_date", from).lte("issue_date", to).not("status", "in", "(draft,void)").order("issue_date").limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    header = ["Invoice date", "Invoice", "Customer", "Taxable amount (KES)", "VAT (KES)", "Total (KES)"];
    for (const r of (data ?? []) as Row[]) out.push([String(r.issue_date), String(r.invoice_number), String(nested(r, "customers").display_name ?? ""), kes(r.subtotal_cents), kes(r.tax_cents), kes(r.total_cents)]);
  } else if (type === "mpesa") {
    const { data, error } = await db
      .from("mpesa_transactions")
      .select("mpesa_receipt_number, transacted_at, amount_cents, payments(internal_reference, status, customers(display_name))")
      .gte("transacted_at", `${from}T00:00:00+03:00`).lte("transacted_at", `${to}T23:59:59+03:00`).order("transacted_at").limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    header = ["M-Pesa reference", "Date", "Amount (KES)", "Customer", "Internal payment", "Reconciliation status"];
    for (const r of (data ?? []) as Row[]) {
      const pay = nested(r, "payments");
      out.push([String(r.mpesa_receipt_number), String(r.transacted_at), kes(r.amount_cents), String(nested(pay, "customers").display_name ?? ""), String(pay.internal_reference ?? ""), pay.status ? String(pay.status) : "unmatched"]);
    }
  } else if (type === "cheques") {
    const { data, error } = await db
      .from("cheque_payments")
      .select("cheque_number, bank_name, status, cheque_date, received_date, cleared_date, payments!inner(amount_cents, received_at, customers(display_name))")
      .gte("payments.received_at", `${from}T00:00:00+03:00`).lte("payments.received_at", `${to}T23:59:59+03:00`).limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    header = ["Cheque no.", "Bank", "Customer", "Amount (KES)", "Status", "Cheque date", "Received", "Cleared"];
    for (const r of (data ?? []) as Row[]) {
      const pay = nested(r, "payments");
      out.push([String(r.cheque_number), String(r.bank_name), String(nested(pay, "customers").display_name ?? ""), kes(pay.amount_cents), String(r.status), r.cheque_date as Cell, r.received_date as Cell, r.cleared_date as Cell]);
    }
  } else if (type === "statement") {
    const customer = p.get("customer") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(customer)) return NextResponse.json({ error: "customer is required" }, { status: 400 });
    const { data, error } = await db.rpc("get_account_statement", { p_customer_id: customer, p_from: p.get("from") && iso.test(p.get("from")!) ? p.get("from") : null, p_to: p.get("to") && iso.test(p.get("to")!) ? p.get("to") : null });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const s = data as { opening_balance_cents: number; closing_balance_cents: number; total_debits_cents: number; total_credits_cents: number; rows: { date: string; reference: string; description: string; debit_cents: number; credit_cents: number; running_balance_cents: number }[] };
    header = ["Date", "Reference", "Description", "Debit (KES)", "Credit (KES)", "Running balance (KES)"];
    out.push(["", "", "Opening balance", "", "", kes(s.opening_balance_cents)]);
    for (const r of s.rows) out.push([r.date, r.reference, r.description, r.debit_cents ? kes(r.debit_cents) : "", r.credit_cents ? kes(r.credit_cents) : "", kes(r.running_balance_cents)]);
    out.push(["", "", "Totals", kes(s.total_debits_cents), kes(s.total_credits_cents), ""]);
    out.push(["", "", "Closing balance", "", "", kes(s.closing_balance_cents)]);
    name = `statement-${customer.slice(0, 8)}`;
  } else {
    return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  }

  const period = type === "receivables" ? `as at ${todayNairobi()}` : `${from === "1970-01-01" ? "start" : from} to ${to === "2999-12-31" ? "today" : to}`;
  const lines = [[title], [`Report: ${type}`], [`Period: ${period}`], [], header, ...out].map((r) => r.map(cell).join(","));
  return new NextResponse("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${from === "1970-01-01" ? "all" : from}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
