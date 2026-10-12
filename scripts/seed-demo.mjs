/**
 * scripts/seed-demo.mjs - fills the LOCAL database with believable demo data so
 * the app can be presented: service plans, approved customers, subscriptions,
 * issued/paid/overdue invoices, payments and collection requests.
 *
 * It goes through the SAME paths the app uses (real sign-up, super-admin
 * approval, create_invoice / record_payment / allocate_payment functions), so
 * every rule and ledger entry is real. It signs in as your admin, so it needs
 * ADMIN_EMAIL / ADMIN_PASSWORD (a super_admin) and the anon key.
 *
 * SAFETY: refuses to run unless the database is local (127.0.0.1 / localhost).
 * Safe to re-run: existing plans/customers are reused. Run `supabase db reset`
 * first (and re-create your admin) for a clean slate.
 */
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!URL || !ANON || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ADMIN_EMAIL and ADMIN_PASSWORD first.");
  process.exit(1);
}
if (!/127\.0\.0\.1|localhost/.test(URL)) {
  console.error("Refusing to seed demo data into a non-local database:", URL);
  process.exit(1);
}

const client = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DEMO_PASSWORD = "Demo@12345";
let failures = 0;

async function step(label, fn) {
  try {
    const out = await fn();
    console.log(`  ok   ${label}`);
    return out;
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}: ${e?.message ?? e}`);
    return null;
  }
}
const must = (res, what) => { if (res.error) throw new Error(`${what}: ${res.error.message}`); return res.data; };

const admin = client();
{
  const { error } = await admin.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) { console.error("Could not sign in as the admin:", error.message); process.exit(1); }
}

/* ------------------------------------------------------------------ plans */
console.log("\nService plans");
const PLANS = [
  { code: "RES-WEEKLY", name: "Residential Weekly Collection", waste_type: "general", default_frequency: "weekly", price: 150000 },
  { code: "RES-BIWEEKLY", name: "Residential Bi-weekly Collection", waste_type: "general", default_frequency: "biweekly", price: 90000 },
  { code: "COM-WEEKLY", name: "Commercial Weekly Collection", waste_type: "general", default_frequency: "weekly", price: 450000 },
  { code: "REC-MONTHLY", name: "Recycling Monthly Pickup", waste_type: "recyclable", default_frequency: "monthly", price: 60000 },
];
const plan = {};
for (const p of PLANS) {
  await step(`${p.name} (KSh ${p.price / 100})`, async () => {
    let { data: row } = await admin.from("service_plans").select("id").eq("code", p.code).maybeSingle();
    if (!row) {
      row = must(await admin.from("service_plans").insert({ code: p.code, name: p.name, waste_type: p.waste_type, default_frequency: p.default_frequency }).select("id").single(), "plan");
      must(await admin.from("service_plan_prices").insert({ service_plan_id: row.id, price_cents: p.price, effective_from: today }), "price");
    }
    plan[p.code] = { id: row.id, name: p.name, price: p.price, frequency: p.default_frequency };
  });
}

/* -------------------------------------------------------------- customers */
console.log("\nCustomers (real sign-up, then super-admin approval)");
const CUSTOMERS = [
  { type: "individual", name: "Amina Wanjiru", email: "amina.demo@example.com", p1: "0712000101", p2: "0722000101", ward: "Kileleshwa", street: "Othaya Road", house: "House 14", plan: "RES-WEEKLY", scenario: "paid" },
  { type: "individual", name: "Brian Otieno", email: "brian.demo@example.com", p1: "0712000102", p2: "0722000102", ward: "Kilimani", street: "Argwings Kodhek Road", house: "Apartment 3B", plan: "RES-BIWEEKLY", scenario: "partial" },
  { type: "corporate", name: "Savannah Cafe Ltd", email: "savannah.demo@example.com", p1: "0712000103", p2: "0722000103", ward: "Westlands", street: "Mpaka Road", house: "Unit 7", plan: "COM-WEEKLY", scenario: "paid" },
  { type: "corporate", name: "Greenfield Apartments", email: "greenfield.demo@example.com", p1: "0712000104", p2: "0722000104", ward: "Lavington", street: "James Gichuru Road", house: "Block A", plan: "COM-WEEKLY", scenario: "overdue" },
  { type: "individual", name: "Grace Muthoni", email: "grace.demo@example.com", p1: "0712000105", p2: "0722000105", ward: "Karen", street: "Karen Road", house: "Gate 22", plan: "REC-MONTHLY", scenario: "current" },
  { type: "individual", name: "Peter Kamau", email: "peter.demo@example.com", p1: "0712000106", p2: "0722000106", ward: "South B", street: "Mombasa Road", house: "House 9", plan: "RES-WEEKLY", scenario: "none" },
];

const customerId = {};
for (const c of CUSTOMERS) {
  await step(`${c.name}`, async () => {
    let { data: existing } = await admin.from("customers").select("id, approval_status").eq("display_name", c.name).maybeSingle();
    if (!existing) {
      const { error } = await client().auth.signUp({
        email: c.email,
        password: DEMO_PASSWORD,
        options: {
          data: {
            customer_type: c.type, full_name: c.name, phone_primary: c.p1, phone_secondary: c.p2,
            county: "Nairobi", ward: c.ward, region: null, street_name: c.street, house_number: c.house, address_description: null,
            requested_services: ["Garbage Collection"], service_days: [1, 4], billing_cycle: "monthly",
            caretaker_name: null, caretaker_phone: null, caretaker_email: null, terms_accepted_at: new Date().toISOString(),
          },
        },
      });
      if (error) throw new Error(`sign-up: ${error.message}`);
      ({ data: existing } = await admin.from("customers").select("id, approval_status").eq("display_name", c.name).maybeSingle());
    }
    if (!existing) throw new Error("customer row was not created by the sign-up trigger");
    if (existing.approval_status !== "approved") {
      must(await admin.rpc("review_customer_signup", { p_customer_id: existing.id, p_approve: true, p_note: "Demo approval" }), "approve");
    }
    customerId[c.name] = existing.id;
  });
}

/* ----------------------------------------------- contracts + subscriptions */
console.log("\nContracts and subscriptions");
const subscribed = {};
for (const c of CUSTOMERS) {
  const cid = customerId[c.name];
  if (!cid) continue;
  await step(`${c.name} -> ${c.plan}`, async () => {
    const { data: have } = await admin.from("subscriptions").select("id").eq("customer_id", cid).limit(1);
    if (have?.length) { subscribed[c.name] = true; return; }
    const addr = must(await admin.from("service_addresses").select("id").eq("customer_id", cid).limit(1), "address")[0];
    if (!addr) throw new Error("no service address");
    const n = String(CUSTOMERS.indexOf(c) + 1).padStart(3, "0");
    const contract = must(await admin.from("contracts").insert({
      customer_id: cid, contract_number: `DEMO-${n}`, start_date: addDays(today, -60), billing_terms: "net_15", status: "active",
    }).select("id").single(), "contract");
    const sub = must(await admin.from("subscriptions").insert({
      contract_id: contract.id, customer_id: cid, service_address_id: addr.id,
      service_plan_id: plan[c.plan].id, frequency: plan[c.plan].frequency, start_date: addDays(today, -45),
    }).select("id").single(), "subscription");
    must(await admin.rpc("transition_subscription_status", { p_subscription_id: sub.id, p_new_status: "active" }), "activate");
    subscribed[c.name] = true;
  });
}

/* ------------------------------------------------- invoices and payments */
console.log("\nInvoices and payments");
const methodFor = ["mpesa", "bank_transfer", "cash"];
let payN = 0;
for (const c of CUSTOMERS) {
  const cid = customerId[c.name];
  if (!cid) continue;
  const p = plan[c.plan];
  await step(`${c.name}: invoice (${c.scenario})`, async () => {
    const { data: have } = await admin.from("invoices").select("id").eq("customer_id", cid).limit(1);
    if (have?.length) return;

    const overdue = c.scenario === "overdue";
    const current = c.scenario === "current" || c.scenario === "none";
    const issue = addDays(today, overdue ? -50 : current ? -3 : -35);
    const due = addDays(issue, 15);
    const invoiceId = must(await admin.rpc("create_invoice", {
      p_customer_id: cid, p_issue_date: issue, p_due_date: due,
      p_period_start: addDays(issue, 0), p_period_end: addDays(issue, 29), p_notes: `Demo invoice - ${p.name}`,
      p_items: [{ service_plan_id: p.id, description: p.name, quantity: "1", unit_price_cents: p.price }],
    }), "create invoice");
    if (c.scenario === "none") return; // leave as a draft
    must(await admin.rpc("issue_invoice", { p_invoice_id: invoiceId }), "issue invoice");

    if (c.scenario === "paid" || c.scenario === "partial") {
      const amount = c.scenario === "paid" ? p.price : Math.round(p.price / 2);
      const method = methodFor[payN++ % methodFor.length];
      const paymentId = must(await admin.rpc("record_payment", {
        p_customer_id: cid, p_method: method, p_amount_cents: amount,
        p_received_at: new Date(Date.now() - 20 * 86400000).toISOString(),
        p_reference: method === "mpesa" ? `DEMO${String(payN).padStart(6, "0")}` : method === "bank_transfer" ? `BANK-DEMO-${payN}` : null,
      }), "record payment");
      const v = await admin.rpc("verify_payment", { p_payment_id: paymentId, p_approve: true });
      if (v.error && !/already|confirmed/i.test(v.error.message)) throw new Error(`verify: ${v.error.message}`);
      must(await admin.rpc("allocate_payment", { p_payment_id: paymentId, p_invoice_id: invoiceId, p_amount_cents: amount }), "allocate payment");
    }
  });
}

/* ------------------------------------------------- collection requests */
console.log("\nCollection requests");
for (const [idx, c] of CUSTOMERS.slice(0, 3).entries()) {
  const cid = customerId[c.name];
  if (!cid) continue;
  await step(`${c.name}: bulky-waste request${idx === 0 ? " (approved -> scheduled)" : " (left pending)"}`, async () => {
    const { data: have } = await admin.from("waste_collection_requests").select("id").eq("customer_id", cid).limit(1);
    if (have?.length) return;
    const cust = client();
    const login = await cust.auth.signInWithPassword({ email: c.email, password: DEMO_PASSWORD });
    if (login.error) throw new Error(`customer sign-in: ${login.error.message}`);
    const addr = must(await cust.from("service_addresses").select("id").eq("customer_id", cid).limit(1), "address")[0];
    const req = must(await cust.from("waste_collection_requests").insert({
      customer_id: cid, service_address_id: addr.id, waste_type: "bulky",
      requested_date: addDays(today, 2), notes: idx === 0 ? "Old sofa and mattress" : "Garden waste after pruning",
    }).select("id").single(), "request");
    if (idx === 0) {
      must(await admin.rpc("review_collection_request", { p_request_id: req.id, p_approve: true, p_scheduled_date: addDays(today, 2), p_note: "See you then" }), "approve request");
    }
  });
}

console.log(`\n${failures === 0 ? "DONE - demo data loaded." : `Finished with ${failures} failed step(s) - paste the FAIL lines to get them fixed.`}`);
console.log(`
Customer logins (password for all: ${DEMO_PASSWORD}):
${CUSTOMERS.map((c) => `  ${c.email}`).join("\n")}
Sign in as your admin to see the dashboard, invoices, payments, finance and requests.
`);
process.exit(failures === 0 ? 0 : 2);
