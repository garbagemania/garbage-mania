-- 011_rls_policies.sql
-- Garbage Mania RLS Policies
-- Corrected to use public helper functions

-- ============================================================
-- CRITICAL FIX: missing RLS enablement for identity/customer tables
-- ============================================================
-- 001_identity.sql and 002_customers.sql lost their
-- `alter table ... enable row level security` statements at some point
-- after the original schema was written - confirmed by grepping the
-- entire migration set for these 11 tables and finding zero matches
-- anywhere. Without this, every policy below for these tables is dead
-- code: Postgres does not enforce ANY policy on a table that doesn't
-- have RLS enabled, meaning profiles, customers, and every other table
-- in this block would currently be fully readable/writable by any role
-- with a table grant, regardless of the policies that follow. This is
-- the single most important fix in this file - restored here rather
-- than split back into 001/002, so it's impossible to miss in review.

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.documents enable row level security;
alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.properties enable row level security;
alter table public.service_addresses enable row level security;
alter table public.customer_profiles enable row level security;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function public.is_assigned_driver(
  p_daily_assignment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.driver_assignments da
    where da.daily_assignment_id = p_daily_assignment_id
    and da.driver_id = auth.uid()
  );
$$;


create or replace function public.is_assigned_driver_for_collection(
  p_collection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.collections c
    where c.id = p_collection_id
    and public.is_assigned_driver(c.daily_assignment_id)
  );
$$;


-- Re-added: referenced by the customer-visibility policies on
-- collection_status_events/failed_collections/collection_evidence below.
-- A previous edit removed this function along with the policies that
-- used it; restoring both together rather than leaving the function
-- orphaned or the policies missing their ownership check.
create or replace function public.owns_collection(
  p_collection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.collections c
    where c.id = p_collection_id
    and public.owns_service_address(c.service_address_id)
  );
$$;


-- ============================================================
-- ROLES
-- ============================================================

create policy roles_select
on public.roles
for select
to authenticated
using (true);


create policy roles_insert
on public.roles
for insert
to authenticated
with check (
  public.user_role() in ('super_admin','admin')
);


create policy roles_update
on public.roles
for update
to authenticated
using (
  public.user_role() in ('super_admin','admin')
)
with check (
  public.user_role() in ('super_admin','admin')
);


-- ============================================================
-- PERMISSIONS
-- ============================================================

create policy permissions_select
on public.permissions
for select
to authenticated
using (true);


create policy permissions_insert
on public.permissions
for insert
to authenticated
with check (
  public.user_role() in ('super_admin','admin')
);


create policy permissions_update
on public.permissions
for update
to authenticated
using (
  public.user_role() in ('super_admin','admin')
)
with check (
  public.user_role() in ('super_admin','admin')
);


-- ============================================================
-- PROFILES
-- ============================================================

create policy profiles_select_self
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);


create policy profiles_select_staff
on public.profiles
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager',
    'finance'
  )
);


create policy profiles_update_self
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);


create policy profiles_update_staff
on public.profiles
for update
to authenticated
using (
  public.user_role() in ('super_admin','admin')
)
with check (
  public.user_role() in ('super_admin','admin')
);-- ============================================================
-- CUSTOMERS
-- ============================================================

create policy customers_select_staff
on public.customers
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy customers_select_owner
on public.customers
for select
to authenticated
using (
  public.user_role() = 'customer'
  and id = public.customer_id()
);


create policy customers_insert_staff
on public.customers
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy customers_update_staff
on public.customers
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


-- ============================================================
-- CUSTOMER CONTACTS
-- ============================================================

create policy customer_contacts_select_staff
on public.customer_contacts
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy customer_contacts_select_owner
on public.customer_contacts
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);


create policy customer_contacts_insert
on public.customer_contacts
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy customer_contacts_update
on public.customer_contacts
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


-- ============================================================
-- SERVICE ADDRESSES
-- ============================================================

create policy service_addresses_select_staff
on public.service_addresses
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy service_addresses_select_owner
on public.service_addresses
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);


create policy service_addresses_insert
on public.service_addresses
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy service_addresses_update
on public.service_addresses
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);-- ============================================================
-- COMMERCIAL
-- ============================================================

create policy service_plans_select
on public.service_plans
for select
to authenticated
using (true);


create policy service_plans_insert
on public.service_plans
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy service_plans_update
on public.service_plans
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


-- ============================================================
-- SERVICE PLAN PRICES
-- ============================================================

create policy service_plan_prices_select
on public.service_plan_prices
for select
to authenticated
using (true);


create policy service_plan_prices_insert
on public.service_plan_prices
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy service_plan_prices_update
on public.service_plan_prices
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


-- ============================================================
-- CONTRACTS
-- ============================================================

create policy contracts_select_staff
on public.contracts
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy contracts_select_customer
on public.contracts
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);


create policy contracts_insert
on public.contracts
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy contracts_update
on public.contracts
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================

create policy subscriptions_select_staff
on public.subscriptions
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy subscriptions_select_customer
on public.subscriptions
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);


create policy subscriptions_insert
on public.subscriptions
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy subscriptions_update
on public.subscriptions
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance'
  )
);


create policy subscription_history_select
on public.subscription_history
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy subscription_history_insert
on public.subscription_history
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);-- ============================================================
-- FLEET
-- ============================================================

create policy vehicles_select_staff
on public.vehicles
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy vehicles_select_driver
on public.vehicles
for select
to authenticated
using (
  public.user_role() = 'driver'
  and exists (
    select 1
    from public.driver_assignments da
    where da.vehicle_id = vehicles.id
    and da.driver_id = auth.uid()
    and da.ended_at is null
  )
);


create policy vehicles_insert
on public.vehicles
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


create policy vehicles_update
on public.vehicles
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- DRIVERS
-- ============================================================

create policy drivers_select_staff
on public.drivers
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy drivers_select_self
on public.drivers
for select
to authenticated
using (
  id = auth.uid()
);


create policy drivers_insert
on public.drivers
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


create policy drivers_update
on public.drivers
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- VEHICLE STATUS HISTORY
-- ============================================================

create policy vehicle_status_history_select
on public.vehicle_status_history
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy vehicle_status_history_insert
on public.vehicle_status_history
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- MAINTENANCE RECORDS
-- ============================================================

create policy maintenance_records_select
on public.maintenance_records
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy maintenance_records_insert
on public.maintenance_records
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


create policy maintenance_records_update
on public.maintenance_records
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);-- ============================================================
-- OPERATIONS
-- ============================================================

create policy routes_select_staff
on public.routes
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy routes_select_driver
on public.routes
for select
to authenticated
using (
  public.user_role() = 'driver'
  and exists (
    select 1
    from public.daily_assignments da
    where da.route_id = routes.id
    and da.assignment_date = current_date
    and public.is_assigned_driver(da.id)
  )
);


create policy routes_insert
on public.routes
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


create policy routes_update
on public.routes
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- DAILY ASSIGNMENTS
-- ============================================================

create policy daily_assignments_select_staff
on public.daily_assignments
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy daily_assignments_select_driver
on public.daily_assignments
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.is_assigned_driver(id)
);


create policy daily_assignments_insert
on public.daily_assignments
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


create policy daily_assignments_update
on public.daily_assignments
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- DRIVER ASSIGNMENTS
-- ============================================================

create policy driver_assignments_select_staff
on public.driver_assignments
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'operations_manager'
  )
);


create policy driver_assignments_select_self
on public.driver_assignments
for select
to authenticated
using (
  driver_id = auth.uid()
);


create policy driver_assignments_insert
on public.driver_assignments
for insert
to authenticated
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


create policy driver_assignments_update
on public.driver_assignments
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- COLLECTIONS
-- ============================================================

create policy collections_select_staff
on public.collections
for select
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'admin',
    'finance',
    'operations_manager'
  )
);


create policy collections_select_driver
on public.collections
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(id)
);


create policy collections_select_customer
on public.collections
for select
to authenticated
using (
  public.user_role() = 'customer'
  and public.owns_service_address(service_address_id)
);


create policy collections_update_operations
on public.collections
for update
to authenticated
using (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
)
with check (
  public.user_role() in (
    'super_admin',
    'operations_manager'
  )
);


-- ============================================================
-- RESTORED: policies missing from a previous edit pass. Verified by
-- cross-referencing every RLS-enabled table (001-010) against every
-- table with at least one policy in this file - these 20 tables had
-- zero policies despite RLS being enabled and, for FINANCE/PAYMENTS,
-- FORCEd, meaning every one of them was fully deny-all for every role
-- including super_admin. Restored below, matching BUSINESS_SCHEMA.md
-- §D and the "Role access summary" exactly.
-- ============================================================

-- ---- OPERATIONS (remaining tables) ----

create policy collection_schedules_select
on public.collection_schedules
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);

create policy collection_schedules_insert
on public.collection_schedules
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);

create policy collection_schedules_update
on public.collection_schedules
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'operations_manager')
)
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);


create policy waste_collection_requests_select_staff
on public.waste_collection_requests
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);

create policy waste_collection_requests_select_own
on public.waste_collection_requests
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy waste_collection_requests_insert_staff
on public.waste_collection_requests
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);

create policy waste_collection_requests_insert_own
on public.waste_collection_requests
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy waste_collection_requests_update_staff
on public.waste_collection_requests
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
)
with check (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);
-- No customer UPDATE policy - a submitted request cannot be edited by
-- the customer once created, per BUSINESS_SCHEMA.md §D.


create policy route_stops_select_staff
on public.route_stops
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);

create policy route_stops_select_driver_today
on public.route_stops
for select
to authenticated
using (
  public.user_role() = 'driver'
  and exists (
    select 1 from public.daily_assignments da
    where da.route_id = route_stops.route_id
      and da.assignment_date = current_date
      and public.is_assigned_driver(da.id)
  )
);

create policy route_stops_insert
on public.route_stops
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);

create policy route_stops_update
on public.route_stops
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'operations_manager')
)
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);


create policy collection_status_events_select_staff
on public.collection_status_events
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager')
);

create policy collection_status_events_select_driver_own
on public.collection_status_events
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(collection_id)
);

create policy collection_status_events_select_own
on public.collection_status_events
for select
to authenticated
using (
  public.user_role() = 'customer'
  and public.owns_collection(collection_id)
);

create policy collection_status_events_insert_ops
on public.collection_status_events
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);

create policy collection_status_events_insert_driver_own
on public.collection_status_events
for insert
to authenticated
with check (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(collection_id)
);


create policy failed_collections_select_staff
on public.failed_collections
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager')
);

create policy failed_collections_select_driver_own
on public.failed_collections
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(collection_id)
);

create policy failed_collections_select_own
on public.failed_collections
for select
to authenticated
using (
  public.user_role() = 'customer'
  and public.owns_collection(collection_id)
);

create policy failed_collections_insert_ops
on public.failed_collections
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);

create policy failed_collections_insert_driver_own
on public.failed_collections
for insert
to authenticated
with check (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(collection_id)
);


create policy collection_evidence_select_staff
on public.collection_evidence
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager')
);

create policy collection_evidence_select_driver_own
on public.collection_evidence
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(collection_id)
);

create policy collection_evidence_select_own
on public.collection_evidence
for select
to authenticated
using (
  public.user_role() = 'customer'
  and public.owns_collection(collection_id)
);

create policy collection_evidence_insert_driver_own
on public.collection_evidence
for insert
to authenticated
with check (
  public.user_role() = 'driver'
  and public.is_assigned_driver_for_collection(collection_id)
);

create policy collection_evidence_insert_ops
on public.collection_evidence
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'operations_manager')
);


-- ---- FINANCE ----

create policy invoices_select_staff
on public.invoices
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy invoices_select_own
on public.invoices
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy invoices_insert
on public.invoices
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy invoices_update
on public.invoices
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy invoice_items_select_staff
on public.invoice_items
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy invoice_items_select_own
on public.invoice_items
for select
to authenticated
using (
  public.user_role() = 'customer'
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.customer_id = public.customer_id()
  )
);

create policy invoice_items_insert
on public.invoice_items
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy invoice_items_update
on public.invoice_items
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy invoice_items_delete
on public.invoice_items
for delete
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
);
-- Delete is permitted here specifically because
-- guard_invoice_items_immutability() (006_finance.sql) already blocks it
-- once the parent invoice leaves 'draft' - a draft invoice's items are
-- legitimately editable/removable before issue.


create policy payments_select_staff
on public.payments
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy payments_select_own
on public.payments
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy payments_insert
on public.payments
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy payments_update
on public.payments
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy payment_allocations_select_staff
on public.payment_allocations
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy payment_allocations_select_own
on public.payment_allocations
for select
to authenticated
using (
  public.user_role() = 'customer'
  and exists (
    select 1 from public.invoices i
    where i.id = payment_allocations.invoice_id and i.customer_id = public.customer_id()
  )
);

create policy payment_allocations_insert
on public.payment_allocations
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy receipts_select_staff
on public.receipts
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy receipts_select_own
on public.receipts
for select
to authenticated
using (
  public.user_role() = 'customer'
  and exists (
    select 1 from public.payments p
    where p.id = receipts.payment_id and p.customer_id = public.customer_id()
  )
);

create policy receipts_insert
on public.receipts
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy financial_transactions_select
on public.financial_transactions
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy financial_transactions_insert
on public.financial_transactions
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy ledger_entries_select
on public.ledger_entries
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy ledger_entries_insert
on public.ledger_entries
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);
-- No customer policy on financial_transactions or ledger_entries at all
-- (Decision 9) - customers use public.get_customer_statement() instead.


-- ---- PAYMENTS ----

create policy mpesa_payment_intents_select
on public.mpesa_payment_intents
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy mpesa_payment_intents_select_own
on public.mpesa_payment_intents
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy mpesa_payment_intents_insert
on public.mpesa_payment_intents
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy mpesa_payment_intents_insert_own
on public.mpesa_payment_intents
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy mpesa_payment_intents_update
on public.mpesa_payment_intents
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy mpesa_transactions_select
on public.mpesa_transactions
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy mpesa_transactions_insert
on public.mpesa_transactions
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy mpesa_callback_records_select
on public.mpesa_callback_records
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
);

create policy mpesa_callback_records_insert
on public.mpesa_callback_records
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);
-- In practice the Daraja callback handler runs server-side under the
-- service-role key, which bypasses RLS - these policies cover any staff
-- tooling that also needs direct access.


create policy cheque_payments_select
on public.cheque_payments
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy cheque_payments_insert
on public.cheque_payments
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy cheque_payments_update
on public.cheque_payments
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy reconciliation_batches_select
on public.reconciliation_batches
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy reconciliation_batches_insert
on public.reconciliation_batches
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy reconciliation_batches_update
on public.reconciliation_batches
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy reconciliation_items_select
on public.reconciliation_items
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy reconciliation_items_insert
on public.reconciliation_items
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy reconciliation_items_update
on public.reconciliation_items
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


create policy refund_payouts_select
on public.refund_payouts
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy refund_payouts_select_own
on public.refund_payouts
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy refund_payouts_insert
on public.refund_payouts
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'finance')
);

create policy refund_payouts_update
on public.refund_payouts
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'finance')
)
with check (
  public.user_role() in ('super_admin', 'finance')
);


-- ---- DOCUMENTS ----

create policy customer_documents_select_staff
on public.customer_documents
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy customer_documents_select_own
on public.customer_documents
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy customer_documents_insert_staff
on public.customer_documents
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin')
);

create policy customer_documents_insert_own
on public.customer_documents
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);


create policy staff_documents_select_staff
on public.staff_documents
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);

create policy staff_documents_select_self
on public.staff_documents
for select
to authenticated
using (
  staff_profile_id = auth.uid()
);

create policy staff_documents_insert
on public.staff_documents
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin')
);


-- ---- COMMUNICATION ----

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (
  recipient_profile_id = auth.uid()
);

create policy notifications_select_staff
on public.notifications
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);

create policy notifications_insert_staff
on public.notifications
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin')
);


create policy notification_deliveries_select_staff
on public.notification_deliveries
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);
-- No insert policy for any role - notification_deliveries is written by
-- the notification-dispatch job under the service-role key, which
-- bypasses RLS by design.


-- ---- SYSTEM ----

create policy audit_log_select_staff
on public.audit_log
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);
-- No insert/update/delete policy for any role - audit_log is written
-- exclusively by log_audit_event() triggers, which run SECURITY DEFINER
-- and so bypass RLS via table ownership (audit_log has ENABLE but not
-- FORCE row level security).

create policy operational_events_select_staff
on public.operational_events
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);
-- No insert/update/delete policy for any role - written only by
-- background jobs under the service-role key, which bypasses RLS.


-- ============================================================
-- RESTORED: five more tables missed by the same gap (enabled via the
-- fix above, but had no policies anywhere in this file).
-- ============================================================

create policy role_permissions_select
on public.role_permissions
for select
to authenticated
using (true);

create policy role_permissions_insert
on public.role_permissions
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin')
);


create policy staff_profiles_select_self
on public.staff_profiles
for select
to authenticated
using (id = auth.uid());

create policy staff_profiles_select_staff
on public.staff_profiles
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);

create policy staff_profiles_insert_staff
on public.staff_profiles
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin')
);

create policy staff_profiles_update_staff
on public.staff_profiles
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
)
with check (
  public.user_role() in ('super_admin', 'admin')
);


create policy documents_select_staff
on public.documents
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager', 'driver')
);

create policy documents_select_customer_linked
on public.documents
for select
to authenticated
using (
  public.user_role() = 'customer'
  and exists (
    select 1 from public.customer_documents cd
    where cd.document_id = documents.id and cd.customer_id = public.customer_id()
  )
);

create policy documents_insert_own_upload
on public.documents
for insert
to authenticated
with check (uploaded_by = auth.uid());


create policy properties_select_staff
on public.properties
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager')
);

create policy properties_select_own
on public.properties
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
);

create policy properties_insert_ops
on public.properties
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);

create policy properties_update_ops
on public.properties
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
)
with check (
  public.user_role() in ('super_admin', 'admin', 'operations_manager')
);


create policy customer_profiles_select_self
on public.customer_profiles
for select
to authenticated
using (id = auth.uid());

create policy customer_profiles_select_staff
on public.customer_profiles
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
);

create policy customer_profiles_insert_staff
on public.customer_profiles
for insert
to authenticated
with check (
  public.user_role() in ('super_admin', 'admin')
);

create policy customer_profiles_update_staff
on public.customer_profiles
for update
to authenticated
using (
  public.user_role() in ('super_admin', 'admin')
)
with check (
  public.user_role() in ('super_admin', 'admin')
);


-- ============================================================
-- END OF 011_RLS_POLICIES.SQL
-- ============================================================
