import { describe, expect, it } from "vitest";
import {
  buildStatement,
  type AllocationRow,
  type CustomerFinancials,
  type InvoiceWithBalance,
  type PaymentRow,
} from "@/lib/portal/finance";

function invoice(id: string, issue: string, total: number, paid: number, status = "issued"): InvoiceWithBalance {
  return {
    id,
    customer_id: "c1",
    invoice_number: `INV-${id}`,
    issue_date: issue,
    due_date: issue,
    status,
    subtotal_cents: total,
    tax_cents: 0,
    total_cents: total,
    currency: "KES",
    paid_cents: paid,
    outstanding_cents: total - paid,
  };
}

function payment(id: string, date: string, amount: number, status = "confirmed"): PaymentRow {
  return { id, payment_method: "mpesa", amount_cents: amount, currency: "KES", status, received_at: `${date}T09:00:00Z`, reference: null };
}

function fin(partial: Partial<CustomerFinancials>): CustomerFinancials {
  const invoices = partial.invoices ?? [];
  return {
    invoices,
    payments: partial.payments ?? [],
    allocations: partial.allocations ?? [],
    receipts: [],
    outstandingCents: invoices.reduce((s, i) => s + i.outstanding_cents, 0),
    rpcOutstandingCents: 0,
  };
}

const alloc = (id: string, p: string, i: string, amount: number): AllocationRow => ({ id, payment_id: p, invoice_id: i, amount_cents: amount });

describe("buildStatement", () => {
  const f = fin({
    invoices: [invoice("1", "2026-01-05", 10000, 10000, "paid"), invoice("2", "2026-02-05", 20000, 5000, "partially_paid")],
    payments: [payment("p1", "2026-01-10", 10000), payment("p2", "2026-02-20", 5000)],
    allocations: [alloc("a1", "p1", "1", 10000), alloc("a2", "p2", "2", 5000)],
  });

  it("produces a running balance whose closing equals the sum of invoice balances", () => {
    const s = buildStatement(f);
    expect(s.openingCents).toBe(0);
    expect(s.lines.map((l) => l.balance_cents)).toEqual([10000, 0, 20000, 15000]);
    expect(s.closingCents).toBe(15000);
    expect(s.closingCents).toBe(f.outstandingCents);
  });

  it("rolls activity before `from` into the opening balance", () => {
    const s = buildStatement(f, "2026-02-01");
    expect(s.openingCents).toBe(0);
    expect(s.lines).toHaveLength(2);
    const g = fin({
      invoices: [invoice("1", "2026-01-05", 10000, 0), invoice("2", "2026-03-05", 2000, 0)],
    });
    const t = buildStatement(g, "2026-02-01");
    expect(t.openingCents).toBe(10000);
    expect(t.closingCents).toBe(12000);
  });

  it("stops at `to` and excludes later activity from the closing balance", () => {
    const s = buildStatement(f, undefined, "2026-01-31");
    expect(s.closingCents).toBe(0);
    expect(s.lines).toHaveLength(2);
  });

  it("ignores void invoices and pending payments", () => {
    const g = fin({
      invoices: [invoice("1", "2026-01-05", 10000, 0, "void"), invoice("2", "2026-01-06", 3000, 0)],
      payments: [payment("p1", "2026-01-07", 3000, "pending")],
    });
    const s = buildStatement(g);
    expect(s.closingCents).toBe(3000);
    expect(s.unappliedPaymentsCents).toBe(0);
  });

  it("reports confirmed payments that are not yet allocated", () => {
    const g = fin({ invoices: [], payments: [payment("p1", "2026-01-07", 4000)] });
    expect(buildStatement(g).unappliedPaymentsCents).toBe(4000);
  });

  it("an empty account has a zero statement", () => {
    const s = buildStatement(fin({}));
    expect(s).toEqual({ openingCents: 0, lines: [], closingCents: 0, unappliedPaymentsCents: 0 });
  });
});
