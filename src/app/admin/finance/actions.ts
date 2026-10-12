"use server";

import { friendlyError } from "@/lib/friendly-error";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requireStaffRole, AuthorizationError } from "@/lib/auth/rbac";
import { FINANCE_DELETERS } from "@/types/roles";
import { parseKesToCents, parsePercentToBp } from "@/lib/money";

/**
 * Every mutation here calls a SECURITY DEFINER function from migration 021,
 * which re-checks the caller's role and recomputes every amount in SQL. The
 * values parsed below are only requests; the database is the authority.
 *
 * `db` is an untyped view of the client because src/types/database.ts has not
 * been regenerated for migration 021 yet (run `npm run db:types`).
 */
type Db = SupabaseClient;

const FINANCE_WRITERS = ["super_admin", "finance"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function back(path: string, params: Record<string, string>): never {
  const safe = params.error ? { ...params, error: friendlyError(params.error) } : params;
  redirect(`${path}?${new URLSearchParams(safe).toString()}`);
}

async function ctx() {
  const user = await requireAuthenticatedUser();
  requireStaffRole(user, [...FINANCE_WRITERS]);
  const supabase = createSupabaseServerClient();
  return { user, supabase, db: supabase as unknown as Db };
}

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const text = (max: number) => z.string().trim().max(max, `Too long (max ${max} characters)`);

/* ------------------------------------------------------------ invoices */

export async function saveInvoice(formData: FormData) {
  const { supabase, db } = await ctx();
  const here = "/admin/finance/invoices/new";

  const head = z
    .object({
      customerId: uuid,
      issueDate: day,
      dueDate: day,
      periodStart: day.optional().or(z.literal("")),
      periodEnd: day.optional().or(z.literal("")),
      notes: text(1000).optional(),
      intent: z.enum(["draft", "issue"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!head.success) back(here, { error: head.error.issues[0]?.message ?? "Check the invoice details." });
  const h = head.data;

  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < 10; i++) {
    const plan = String(formData.get(`plan_${i}`) ?? "");
    let description = String(formData.get(`desc_${i}`) ?? "").trim();
    const qtyRaw = String(formData.get(`qty_${i}`) ?? "").trim();
    const priceRaw = String(formData.get(`price_${i}`) ?? "").trim();
    const vatRaw = String(formData.get(`vat_${i}`) ?? "").trim();
    if (!plan && !description && !priceRaw) continue; // untouched row

    let priceCents = priceRaw ? parseKesToCents(priceRaw) : null;
    if (priceRaw && priceCents === null) back(here, { error: `Line ${i + 1}: invalid unit price.` });

    if (plan) {
      if (!uuid.safeParse(plan).success) back(here, { error: `Line ${i + 1}: invalid service.` });
      // Price blank -> use the service's CURRENT configured price from the database.
      if (priceCents === null) {
        const { data: price } = await supabase
          .from("service_plan_prices")
          .select("price_cents")
          .eq("service_plan_id", plan)
          .is("effective_to", null)
          .maybeSingle();
        if (!price) back(here, { error: `Line ${i + 1}: that service has no current price; enter one.` });
        priceCents = Number(price.price_cents);
      }
      if (!description) {
        const { data: sp } = await supabase.from("service_plans").select("name").eq("id", plan).maybeSingle();
        description = sp?.name ?? "";
      }
    }
    if (!description || priceCents === null) back(here, { error: `Line ${i + 1}: description and unit price are required.` });

    const quantity = qtyRaw || "1";
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(quantity) || Number(quantity) <= 0) back(here, { error: `Line ${i + 1}: invalid quantity.` });

    const line: Record<string, unknown> = { description, quantity, unit_price_cents: priceCents };
    if (plan) line.service_plan_id = plan;
    if (vatRaw) {
      const bp = parsePercentToBp(vatRaw);
      if (bp === null) back(here, { error: `Line ${i + 1}: invalid VAT %.` });
      line.vat_rate_bp = bp;
    }
    items.push(line);
  }
  if (items.length === 0) back(here, { error: "Add at least one line." });

  const { data: invoiceId, error } = await db.rpc("create_invoice", {
    p_customer_id: h.customerId,
    p_issue_date: h.issueDate,
    p_due_date: h.dueDate,
    p_period_start: h.periodStart || null,
    p_period_end: h.periodEnd || null,
    p_notes: h.notes || null,
    p_items: items,
  });
  if (error || !invoiceId) back(here, { error: error?.message ?? "Could not create the invoice." });

  if (h.intent === "issue") {
    const { error: issueError } = await db.rpc("issue_invoice", { p_invoice_id: invoiceId });
    if (issueError) {
      revalidatePath("/admin/invoices");
      back(`/admin/finance/invoices/${invoiceId}`, { error: `Saved as draft, but not issued: ${issueError.message}` });
    }
  }
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
  back(`/admin/finance/invoices/${invoiceId}`, { saved: h.intent === "issue" ? "Invoice issued." : "Draft saved." });
}

export async function invoiceAction(formData: FormData) {
  const parsed = z
    .object({ invoiceId: uuid, intent: z.enum(["issue", "cancel", "discard"]), reason: text(500).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("/admin/invoices", { error: "Invalid request." });
  const { invoiceId, intent, reason } = parsed.data;
  const here = `/admin/finance/invoices/${invoiceId}`;

  // Deleting is admin-only; finance may issue and cancel but not discard.
  // (The database re-checks this in discard_draft_invoice.)
  const user = await requireAuthenticatedUser();
  try {
    requireStaffRole(user, intent === "discard" ? [...FINANCE_DELETERS] : [...FINANCE_WRITERS]);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      back(here, { error: intent === "discard" ? "Only an administrator can delete records." : "You do not have permission to do that." });
    }
    throw e;
  }
  const db = createSupabaseServerClient() as unknown as Db;

  if (intent === "issue") {
    const { error } = await db.rpc("issue_invoice", { p_invoice_id: invoiceId });
    if (error) back(here, { error: error.message });
  } else if (intent === "cancel") {
    const { error } = await db.rpc("cancel_invoice", { p_invoice_id: invoiceId, p_reason: reason ?? "" });
    if (error) back(here, { error: error.message });
  } else {
    const { error } = await db.rpc("discard_draft_invoice", { p_invoice_id: invoiceId });
    if (error) back(here, { error: error.message });
    revalidatePath("/admin/invoices");
    back("/admin/invoices", { saved: "Draft discarded." });
  }
  revalidatePath(here);
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/finance");
  back(here, { saved: intent === "issue" ? "Invoice issued." : "Invoice cancelled." });
}

/* ------------------------------------------------------------ payments */

export async function recordPayment(formData: FormData) {
  const { user, supabase, db } = await ctx();
  const here = "/admin/finance/payments/new";

  const parsed = z
    .object({
      customerId: uuid,
      method: z.enum(["mpesa", "cheque", "cash", "bank_transfer"]),
      receivedOn: day,
      reference: text(100).optional(),
      notes: text(1000).optional(),
      chequeNumber: text(50).optional(),
      bankName: text(100).optional(),
      chequeDate: day.optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(here, { error: parsed.error.issues[0]?.message ?? "Check the payment details." });
  const v = parsed.data;

  const amount = parseKesToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(here, { error: "Enter a valid amount greater than zero." });

  // Supporting document (cheque image etc.) -> PRIVATE bucket, never a DB blob.
  let documentId: string | null = null;
  const file = formData.get("document");
  if (file instanceof File && file.size > 0) {
    const ext = FILE_TYPES[file.type];
    if (!ext) back(here, { error: "Attach a JPEG, PNG, WebP or PDF file." });
    if (file.size > MAX_FILE_BYTES) back(here, { error: "The file is too large (max 10 MB)." });
    const path = `${v.customerId}/${randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("cheque-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) back(here, { error: `Upload failed: ${upErr.message}` });
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({ storage_path: path, file_name: file.name || `attachment.${ext}`, mime_type: file.type, size_bytes: file.size, uploaded_by: user.id })
      .select("id")
      .single();
    if (docErr || !doc) {
      await supabase.storage.from("cheque-images").remove([path]);
      back(here, { error: `Could not register the file: ${docErr?.message ?? "unknown error"}` });
    }
    documentId = doc.id;
  }

  const receivedAt = new Date(`${v.receivedOn}T12:00:00+03:00`).toISOString();
  const { data: paymentId, error } = await db.rpc("record_payment", {
    p_customer_id: v.customerId,
    p_method: v.method,
    p_amount_cents: amount,
    p_received_at: receivedAt,
    p_reference: v.reference || null,
    p_notes: v.notes || null,
    p_document_id: documentId,
    p_cheque:
      v.method === "cheque"
        ? { cheque_number: v.chequeNumber ?? "", bank_name: v.bankName ?? "", cheque_date: v.chequeDate || null, received_date: v.receivedOn }
        : null,
  });
  if (error || !paymentId) back(here, { error: error?.message ?? "Could not record the payment." });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/finance");
  back(`/admin/finance/payments/${paymentId}`, { saved: "Payment recorded and awaiting verification." });
}

export async function verifyPaymentAction(formData: FormData) {
  const { db } = await ctx();
  const parsed = z
    .object({ paymentId: uuid, decision: z.enum(["approve", "reject"]), notes: text(1000).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("/admin/payments", { error: "Invalid request." });
  const v = parsed.data;
  const here = `/admin/finance/payments/${v.paymentId}`;

  const { error } = await db.rpc("verify_payment", {
    p_payment_id: v.paymentId,
    p_approve: v.decision === "approve",
    p_notes: v.notes || null,
  });
  if (error) back(here, { error: error.message });
  revalidatePath(here);
  revalidatePath("/admin/payments");
  revalidatePath("/admin/finance");
  back(here, { saved: v.decision === "approve" ? "Payment verified and posted to the ledger." : "Payment rejected." });
}

export async function allocatePaymentAction(formData: FormData) {
  const { db } = await ctx();
  const parsed = z.object({ paymentId: uuid, invoiceId: uuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("/admin/payments", { error: "Invalid request." });
  const here = `/admin/finance/payments/${parsed.data.paymentId}`;
  const amount = parseKesToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(here, { error: "Enter a valid allocation amount." });

  const { error } = await db.rpc("allocate_payment", {
    p_payment_id: parsed.data.paymentId,
    p_invoice_id: parsed.data.invoiceId,
    p_amount_cents: amount,
  });
  if (error) back(here, { error: error.message });
  revalidatePath(here);
  revalidatePath("/admin/finance");
  back(here, { saved: "Payment allocated." });
}

/* ------------------------------------------------------------ refunds */

export async function refundAction(formData: FormData) {
  const { db } = await ctx();
  const parsed = z
    .object({
      paymentId: uuid,
      intent: z.enum(["request", "approve", "reject", "complete"]),
      refundId: uuid.optional().or(z.literal("")),
      method: z.enum(["mpesa_b2c", "bank_transfer", "cheque"]).optional(),
      reason: text(500).optional(),
      reference: text(100).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) back("/admin/refunds", { error: "Invalid request." });
  const v = parsed.data;
  const here = `/admin/finance/payments/${v.paymentId}`;

  if (v.intent === "request") {
    const amount = parseKesToCents(String(formData.get("amount") ?? ""));
    if (amount === null || amount <= 0 || !v.method) back(here, { error: "Enter an amount and a refund method." });
    const { error } = await db.rpc("request_refund", { p_payment_id: v.paymentId, p_amount_cents: amount, p_method: v.method, p_reason: v.reason ?? "" });
    if (error) back(here, { error: error.message });
  } else {
    if (!v.refundId) back(here, { error: "Invalid request." });
    const call =
      v.intent === "approve" ? db.rpc("approve_refund", { p_refund_id: v.refundId })
      : v.intent === "reject" ? db.rpc("reject_refund", { p_refund_id: v.refundId, p_reason: v.reason ?? "" })
      : db.rpc("complete_refund", { p_refund_id: v.refundId, p_external_reference: v.reference ?? "" });
    const { error } = await call;
    if (error) back(here, { error: error.message });
  }
  revalidatePath(here);
  revalidatePath("/admin/refunds");
  back(here, { saved: "Refund updated." });
}

/* ------------------------------------------- credit notes / adjustments */

export async function creditNoteAction(formData: FormData) {
  const { db } = await ctx();
  const parsed = z
    .object({ customerId: uuid, invoiceId: uuid.optional().or(z.literal("")), reason: text(500) })
    .safeParse(Object.fromEntries(formData));
  const here = `/admin/finance/customers/${String(formData.get("customerId") ?? "")}`;
  if (!parsed.success) back("/admin/finance/customers", { error: "Invalid request." });
  const amount = parseKesToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(here, { tab: "adjustments", error: "Enter a valid credit amount." });
  const vatRaw = String(formData.get("vat") ?? "").trim();
  const bp = vatRaw ? parsePercentToBp(vatRaw) : 0;
  if (bp === null) back(here, { tab: "adjustments", error: "Invalid VAT %." });

  const { error } = await db.rpc("issue_credit_note", {
    p_invoice_id: parsed.data.invoiceId || null,
    p_customer_id: parsed.data.customerId,
    p_subtotal_cents: amount,
    p_vat_rate_bp: bp,
    p_reason: parsed.data.reason,
  });
  if (error) back(here, { tab: "adjustments", error: error.message });
  revalidatePath(here);
  back(here, { tab: "adjustments", saved: "Credit note issued." });
}

export async function debitAdjustmentAction(formData: FormData) {
  const { db } = await ctx();
  const parsed = z
    .object({ customerId: uuid, reason: text(500), reference: text(100).optional(), notes: text(1000).optional() })
    .safeParse(Object.fromEntries(formData));
  const here = `/admin/finance/customers/${String(formData.get("customerId") ?? "")}`;
  if (!parsed.success) back("/admin/finance/customers", { error: "Invalid request." });
  const amount = parseKesToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount <= 0) back(here, { tab: "adjustments", error: "Enter a valid adjustment amount." });

  const { error } = await db.rpc("create_debit_adjustment", {
    p_customer_id: parsed.data.customerId,
    p_amount_cents: amount,
    p_reason: parsed.data.reason,
    p_reference: parsed.data.reference || null,
    p_notes: parsed.data.notes || null,
    p_document_id: null,
  });
  if (error) back(here, { tab: "adjustments", error: error.message });
  revalidatePath(here);
  back(here, { tab: "adjustments", saved: "Debit adjustment recorded." });
}
