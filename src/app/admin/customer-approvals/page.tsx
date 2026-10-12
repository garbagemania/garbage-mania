import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-kit";
import { requirePageRoles } from "@/lib/auth/page-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { billingCycleLabel, dayLabel } from "@/lib/validation/customer-signup";
import { reviewSignup } from "./actions";

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];
const TONE = { pending: "warning", approved: "success", rejected: "danger" } as const;

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-900">{children || "—"}</dd>
    </div>
  );
}

export default async function CustomerApprovalsPage({
  searchParams,
}: {
  searchParams: { status?: string; saved?: string; error?: string };
}) {
  // Super admin only: the page, the action and the database function all enforce it.
  await requirePageRoles(["super_admin"]);

  const filter: Filter = FILTERS.find((f) => f === searchParams.status) ?? "pending";
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("customer_signup_requests")
    .select("*, customers ( approval_status )")
    .order("submitted_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []).map((r) => {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
    return { ...r, approval: (c?.approval_status ?? "pending") as keyof typeof TONE };
  });
  const counts = {
    pending: rows.filter((r) => r.approval === "pending").length,
    approved: rows.filter((r) => r.approval === "approved").length,
    rejected: rows.filter((r) => r.approval === "rejected").length,
    all: rows.length,
  };
  const shown = filter === "all" ? rows : rows.filter((r) => r.approval === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer approvals"
        description="New customer sign-ups cannot use their account until a super admin approves them."
      />

      {searchParams.saved && (
        <p role="status" className="rounded-md bg-brand-green-50 px-4 py-3 text-sm text-brand-green-700">
          Customer {searchParams.saved}.
        </p>
      )}
      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <a
            key={f}
            href={`/admin/customer-approvals?status=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              f === filter
                ? "border-brand-green-500 bg-brand-green-50 text-brand-green-700"
                : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
          </a>
        ))}
      </nav>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load sign-ups: {error.message}
        </p>
      )}

      {!error && shown.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            {filter === "pending" ? "No applications are waiting for approval." : "No applications in this view."}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {shown.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">{r.name}</h2>
                  <p className="text-sm text-neutral-600">
                    {r.customer_type === "corporate" ? "Corporate" : "Individual"} · submitted {formatDateTime(r.submitted_at)}
                  </p>
                </div>
                <Badge tone={TONE[r.approval]}>{r.approval}</Badge>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Item label="Email">{r.email}</Item>
                <Item label="Phone">{r.phone_primary}</Item>
                <Item label="Second phone">{r.phone_secondary}</Item>
                <Item label="County">{r.county}</Item>
                <Item label="Ward">{r.ward}</Item>
                <Item label="Region">{r.region}</Item>
                <Item label="Street / road">{r.street_name}</Item>
                <Item label="House / gate / apartment">{r.house_number}</Item>
                <Item label="Address description">{r.address_description}</Item>
                <Item label="Services requested">{r.requested_services.join(", ")}</Item>
                <Item label="Preferred service days">{r.service_days.map(dayLabel).join(", ")}</Item>
                <Item label="Billing cycle">{billingCycleLabel(r.billing_cycle)}</Item>
                <Item label="Caretaker">
                  {[r.caretaker_name, r.caretaker_phone, r.caretaker_email].filter(Boolean).join(" · ")}
                </Item>
              </dl>

              {r.reviewed_at && (
                <p className="text-sm text-neutral-600">
                  Reviewed {formatDateTime(r.reviewed_at)}
                  {r.review_note ? ` — ${r.review_note}` : ""}
                </p>
              )}

              {r.approval === "pending" && (
                <form action={reviewSignup} className="flex flex-wrap items-end gap-3 border-t border-neutral-100 pt-4">
                  <input type="hidden" name="customerId" value={r.customer_id} />
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor={`note-${r.id}`} className="mb-1 block text-xs font-medium text-neutral-600">
                      Note (optional, e.g. reason for rejecting)
                    </label>
                    <input
                      id={`note-${r.id}`}
                      name="note"
                      maxLength={1000}
                      className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                    />
                  </div>
                  <Button type="submit" name="decision" value="approve">
                    Approve
                  </Button>
                  <Button type="submit" name="decision" value="reject" variant="danger">
                    Reject
                  </Button>
                </form>
              )}

              {r.approval === "rejected" && (
                <form action={reviewSignup} className="border-t border-neutral-100 pt-4">
                  <input type="hidden" name="customerId" value={r.customer_id} />
                  <Button type="submit" name="decision" value="approve" variant="outline">
                    Approve after all
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-neutral-500">
        The services, days and billing cycle above are what the customer asked for. Create their subscription and agree
        the fee under Subscriptions after approving.
      </p>
    </div>
  );
}
