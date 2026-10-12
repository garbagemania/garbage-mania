# Garbage Mania — Business Schema Design

Status: **Design document. No migrations exist yet.** This defines the
production PostgreSQL domain model on top of the foundation already built
(extensions, `set_updated_at()`, generic `audit_log` — see `ARCHITECTURE.md`
and `supabase/migrations/000_foundation.sql`). Nothing here is
implemented; §"Architecture decisions requiring approval" at the end lists
what needs a decision before migrations are written.

---

## 0. Conventions used throughout this document

These apply to every table below unless a table explicitly overrides one.

- **Primary keys**: `id uuid primary key default gen_random_uuid()` on every
  table, including join/history tables. Natural keys (invoice numbers,
  receipt numbers, M-Pesa receipt numbers) are separate `unique` business
  identifiers, never the primary key — business identifiers change format
  over time; surrogate keys don't.
- **Timestamps**: every table has `created_at timestamptz not null default
  now()`. Mutable tables also have `updated_at timestamptz not null default
  now()` maintained by the existing `set_updated_at()` trigger. Append-only /
  immutable tables (ledger entries, audit log, M-Pesa callback records,
  status-history tables) have `created_at` only — there is nothing to update.
- **Money**: always `amount_cents bigint not null` (never `numeric`/`float`
  for currency). `bigint` rather than `integer` because corporate contract
  totals and cumulative ledger balances can exceed the ~21.4M KES ceiling of
  a 4-byte int at the cents scale. Every monetary table also carries
  `currency char(3) not null default 'KES'` — the business is KES-only today,
  but stamping the currency now costs one column and avoids a painful
  backfill if that ever changes; it is not a multi-currency *feature*, just a
  cheap forward-compatible column.
- **Soft delete vs. hard delete**: customer-facing and financial-adjacent
  records are never hard-deleted. They carry a `status` enum (e.g. `active` /
  `suspended` / `closed` / `cancelled`) and, where "deleted" is a meaningful
  state distinct from those, a nullable `deleted_at timestamptz`. Pure
  operational/log tables (collections, audit log, callback records) are
  append-only and never deleted at all. Hard `DELETE` is not part of normal
  application flow anywhere in this schema.
- **Enums**: modeled as Postgres `enum` types (not free-text, not a lookup
  table) for closed, rarely-changing value sets (statuses, payment methods,
  document types). `roles` and `permissions` are real tables, not enums,
  because they're the one part of this schema expected to grow without a
  migration (see IDENTITY).
- **Foreign keys**: `on delete restrict` by default (you cannot delete a
  customer with invoices). `on delete cascade` is used only for true
  ownership children that have no independent meaning (e.g. `invoice_items`
  belonging to an `invoice`). `on delete set null` is used for optional
  "who did this" references where the actor's account may later be removed
  (e.g. `audit_log.actor_id`, already defined this way in the foundation
  migration).
- **Every table listed here is expected to get an `audit_<table>` trigger**
  (`public.log_audit_event()`, already defined in the foundation migration)
  **unless marked "not audited"** with a reason. High-volume pure-log tables
  (collection evidence uploads, notification delivery attempts) are marked
  not-audited because they are themselves an audit trail.
- **RLS**: `alter table ... enable row level security;` on every table below,
  with `force row level security` on financial tables so even the table
  owner role is bound by policy in application code paths (service-role
  jobs intentionally bypass RLS, per Postgres/Supabase behavior, for
  batch billing/reconciliation work — see §D).
- **Naming**: snake_case, singular concept / plural table name
  (`customers`, not `customer`), `*_id` for FKs, `*_at` for timestamptz,
  `*_cents` for money, `*_status` only when a table has more than one status
  concept (otherwise just `status`).

### RLS role-identity model (used by every policy in §D)

Policies below assume two SQL helper functions, created once as part of the
IDENTITY tables' migration (not repeated per table):

- `auth.user_role() returns role_code` — reads the caller's role from
  `profiles.role_id → roles.code` for the row matching `auth.uid()`.
- `auth.customer_id() returns uuid` — for a caller whose role is `customer`,
  returns their `customer_profiles.customer_id`; null otherwise.

This is a deliberate change from the current foundation code, which reads
role out of the Supabase Auth JWT (`app_metadata.role`). See **Decision 5**
— reading role from `profiles` via a `security definer` function avoids
policies trusting a JWT claim that can go stale between a role change and
the user's next token refresh, at the cost of one extra lookup per
RLS-checked query (cheap, and cacheable within a statement).

---

## 1. IDENTITY

### `roles`
Purpose: canonical list of system roles. A real table, not an enum, so a new
role (e.g. a future `auditor` role) is a data row, not a migration.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| code | text | no | unique. One of: `super_admin`, `admin`, `finance`, `operations_manager`, `driver`, `customer` — see Decision 1 on reconciling this with the foundation-phase role list |
| label | text | no | display name |
| description | text | yes | |
| created_at | timestamptz | no | |

Unique: `code`. Not expected to change often — treated as reference data,
seeded once, edited by migration rather than the app.

### `permissions`
Purpose: fine-grained capability keys (e.g. `invoice.void`,
`collection.reassign`, `payment.refund`) used for in-app authorization
checks that are finer-grained than "which area can this role enter"
(that coarse check stays in `src/middleware.ts` / `roleCanAccess`). RLS
policies in §D reference roles directly for row-level access; this table is
for *action*-level gates inside an allowed area (e.g. any `finance` user can
view invoices, but only some finance users might be allowed to `void` one —
if/when that distinction is needed).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| code | text | no | unique, e.g. `invoice.void` |
| description | text | no | |
| created_at | timestamptz | no | |

### `role_permissions`
Purpose: join table, which roles hold which permissions.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| role_id | uuid | no | FK → `roles.id`, on delete cascade |
| permission_id | uuid | no | FK → `permissions.id`, on delete cascade |
| created_at | timestamptz | no | |

Unique: `(role_id, permission_id)`.

### `profiles`
Purpose: one row per authenticated identity (`auth.users`), regardless of
whether they're staff or a customer contact. This is the table
`auth.user_role()` reads. Extended by exactly one of `staff_profiles` /
`customer_profiles` below, chosen by `kind`.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK, **and** FK → `auth.users.id`, on delete cascade (profile dies with the auth identity) |
| role_id | uuid | no | FK → `roles.id`, on delete restrict |
| kind | enum(`staff`,`customer`) | no | which extension table has the matching row |
| full_name | text | no | |
| phone | text | yes | Kenyan format, validated at the app layer (existing `kenyanPhoneSchema`) |
| status | enum(`active`,`suspended`,`disabled`) | no | default `active` |
| last_seen_at | timestamptz | yes | updated on login, not audited (high-churn, low-value to audit) |
| created_at / updated_at | timestamptz | no | |

Indexes: `role_id`. Check constraint: `kind = 'customer'` implies role is
`customer`; `kind = 'staff'` implies role in the five staff roles.

### `staff_profiles`
Purpose: internal-employee extension of `profiles`.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK, FK → `profiles.id`, on delete cascade |
| employee_number | text | no | unique |
| department | text | yes | |
| hire_date | date | yes | |
| is_active | boolean | no | default true — separate from `profiles.status` because an ex-employee's login should be `disabled` at the profile level *and* `is_active=false` here for HR-facing reporting that outlives the login |
| created_at / updated_at | timestamptz | no | |

### `customer_profiles`
Purpose: links a login identity to a billing `customer` entity. Modeled
many-to-one deliberately: a corporate customer has several logins (finance
contact, ops contact, owner) that all resolve to the *same* `customers` row
and therefore the same invoices/ledger — this is why `customers` and
`customer_contacts` are separate from `profiles` (see CUSTOMERS below).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK, FK → `profiles.id`, on delete cascade |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| is_primary_contact | boolean | no | default false; exactly one primary per customer, enforced at app layer + a partial unique index |
| created_at / updated_at | timestamptz | no | |

Indexes: `customer_id`. Partial unique index:
`unique (customer_id) where is_primary_contact` (at most one primary contact
login per customer).

---

## 2. CUSTOMERS

### `customers`
Purpose: the billing entity — an individual household or a corporate
account. This, not `profiles`, is what contracts/invoices/the ledger
attach to.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_type | enum(`individual`,`corporate`) | no | |
| display_name | text | no | person's name or company name |
| kra_pin | text | yes | corporate only; unique when present |
| billing_email | citext | yes | |
| billing_phone | text | yes | Kenyan format |
| status | enum(`active`,`suspended`,`closed`) | no | default `active` |
| notes | text | yes | internal staff notes |
| created_at / updated_at | timestamptz | no | |

Unique: `kra_pin` (partial, `where kra_pin is not null`). Indexes:
`status`, `customer_type`.

### `customer_contacts`
Purpose: named people at a corporate customer who are *not* necessarily
system logins (e.g. an accounts-payable contact who only receives emailed
invoices and never logs in). Distinct from `customer_profiles`, which is
strictly "has a login."

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete cascade |
| full_name | text | no | |
| title | text | yes | e.g. "Facilities Manager" |
| email | citext | yes | |
| phone | text | yes | |
| receives_invoices | boolean | no | default false |
| created_at / updated_at | timestamptz | no | |

Indexes: `customer_id`.

### `properties`
Purpose: a physical site owned/occupied by a customer (a home, an office
park, an industrial plant). A corporate customer may have many.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| property_type | enum(`residential`,`commercial`,`industrial`,`institutional`) | no | |
| name | text | yes | e.g. "Westlands Office", null for a single-property individual customer |
| address_line | text | no | |
| ward / sub_county / county | text | yes / yes / no | Kenyan administrative geography; county defaults `'Nairobi'` |
| latitude / longitude | double precision | yes | for route planning |
| status | enum(`active`,`inactive`) | no | default `active` |
| created_at / updated_at | timestamptz | no | |

Indexes: `customer_id`, `(latitude, longitude)` (for route-planning
proximity queries — a full PostGIS geography column is a later upgrade if
route optimization needs it; flagged as **Decision 7**, not adopted now).

### `service_addresses`
Purpose: the specific pinned collection point(s) at a property — a large
property can have more than one (e.g. a mall with a front bin store and a
rear loading-dock skip). This is what schedules, routes, and collections
actually reference — never `properties` directly.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| property_id | uuid | no | FK → `properties.id`, on delete restrict |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict — denormalized from `properties` deliberately, so every operational/collection table can filter by customer without a join through `properties`; kept in sync by a trigger, not app code |
| label | text | no | e.g. "Main gate", "Loading dock" |
| access_notes | text | yes | gate codes, contact-on-arrival instructions |
| latitude / longitude | double precision | yes | |
| status | enum(`active`,`inactive`) | no | default `active` |
| created_at / updated_at | timestamptz | no | |

Indexes: `property_id`, `customer_id`.

---

## 3. COMMERCIAL

### `service_plans`
Purpose: the catalog of standard offerings (waste type, frequency,
container type) that subscriptions are built from.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| code | text | no | unique, e.g. `RES-WEEKLY-240L` |
| name | text | no | |
| waste_type | enum(`general`,`recyclable`,`organic`,`hazardous`,`bulky`) | no | |
| container_type | text | yes | e.g. "240L bin", "skip" |
| default_frequency | enum(`weekly`,`biweekly`,`monthly`,`on_demand`) | no | |
| is_active | boolean | no | default true — retire a plan without deleting history |
| created_at / updated_at | timestamptz | no | |

### `service_plan_prices`
Purpose: **versioned** pricing for a plan. Never overwrite a price —
insert a new row with a new `effective_from`. This is what makes historical
invoices reproducible: an invoice item references the price row that was
in effect, not a mutable "current price" column.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| service_plan_id | uuid | no | FK → `service_plans.id`, on delete cascade |
| price_cents | bigint | no | |
| currency | char(3) | no | default `'KES'` |
| effective_from | date | no | |
| effective_to | date | yes | null = current |
| created_at | timestamptz | no | immutable — no `updated_at`; a pricing mistake is corrected by inserting a superseding row, not editing this one |

Indexes: `(service_plan_id, effective_from)`. Constraint: at most one row
per `service_plan_id` with `effective_to is null` (enforced by a partial
unique index), i.e. exactly one "current" price per plan.

### `contracts`
Purpose: the legal agreement with a customer. A customer can have more than
one over time (renewals) but only one active at a time in the common case.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| contract_number | text | no | unique, human-facing |
| start_date | date | no | |
| end_date | date | yes | null = open-ended |
| billing_terms | enum(`prepaid`,`net_15`,`net_30`) | no | |
| status | enum(`draft`,`active`,`expired`,`terminated`) | no | default `draft` |
| signed_document_id | uuid | yes | FK → `documents.id`, on delete set null — the signed PDF |
| created_at / updated_at | timestamptz | no | |

Unique: `contract_number`. Indexes: `customer_id`, `status`.

### `subscriptions`
Purpose: an active, billable service under a contract — the thing that
actually generates collection schedules and invoices.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| contract_id | uuid | no | FK → `contracts.id`, on delete restrict |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict — denormalized for query convenience, same rationale as `service_addresses.customer_id` |
| service_address_id | uuid | no | FK → `service_addresses.id`, on delete restrict |
| service_plan_id | uuid | no | FK → `service_plans.id`, on delete restrict |
| frequency | enum(`weekly`,`biweekly`,`monthly`,`on_demand`) | no | can override the plan's default |
| status | enum(`pending`,`active`,`paused`,`cancelled`) | no | default `pending` |
| start_date | date | no | |
| end_date | date | yes | |
| created_at / updated_at | timestamptz | no | |

Indexes: `customer_id`, `service_address_id`, `status`.

### `subscription_history`
Purpose: append-only log of every change to a subscription (plan swap,
pause, resume, cancellation) — required both for billing correctness (an
invoice must reflect what plan was active on the collection date) and for
customer-support "what happened to my account" queries.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| subscription_id | uuid | no | FK → `subscriptions.id`, on delete cascade |
| change_type | enum(`created`,`plan_changed`,`paused`,`resumed`,`cancelled`,`address_changed`) | no | |
| previous_value | jsonb | yes | snapshot of changed fields before |
| new_value | jsonb | no | snapshot after |
| changed_by | uuid | yes | FK → `profiles.id`, on delete set null |
| created_at | timestamptz | no | immutable |

Indexes: `subscription_id`.

---

## 4. OPERATIONS

### `collection_schedules`
Purpose: the recurring pattern derived from an active subscription — "this
service address is due on Mondays" — separate from `subscriptions` because
one subscription's frequency can resolve to more than one concrete weekday
rule over its life (e.g. route rebalancing moves a customer from Monday to
Wednesday without changing their subscription).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| subscription_id | uuid | no | FK → `subscriptions.id`, on delete cascade |
| day_of_week | smallint | yes | 0–6, null for `monthly`/`on_demand` patterns |
| day_of_month | smallint | yes | for monthly plans |
| route_id | uuid | yes | FK → `routes.id`, on delete set null — which standing route normally serves this schedule |
| is_active | boolean | no | default true |
| created_at / updated_at | timestamptz | no | |

Indexes: `subscription_id`, `route_id`.

### `waste_collection_requests`
Purpose: **ad-hoc** requests outside the recurring schedule — a customer
asking for a one-off bulky-waste pickup, or a corporate customer requesting
an extra collection this week. Distinct from `collection_schedules`, which
is the standing recurring pattern.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| service_address_id | uuid | no | FK → `service_addresses.id`, on delete restrict |
| waste_type | enum(`general`,`recyclable`,`organic`,`hazardous`,`bulky`) | no | |
| requested_date | date | no | |
| notes | text | yes | customer-provided description |
| status | enum(`submitted`,`approved`,`scheduled`,`rejected`,`cancelled`) | no | default `submitted` |
| resulting_collection_id | uuid | yes | FK → `collections.id`, on delete set null — set once scheduled |
| created_at / updated_at | timestamptz | no | |

Indexes: `customer_id`, `status`.

### `routes`
Purpose: a named, reusable operational route (an area + standard stop
order), independent of any specific date.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| name | text | no | e.g. "Westlands AM" |
| area | text | yes | |
| default_vehicle_id | uuid | yes | FK → `vehicles.id`, on delete set null |
| default_driver_id | uuid | yes | FK → `drivers.id`, on delete set null |
| status | enum(`active`,`inactive`) | no | default `active` |
| created_at / updated_at | timestamptz | no | |

### `route_stops`
Purpose: the ordered, standing list of service addresses on a route.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| route_id | uuid | no | FK → `routes.id`, on delete cascade |
| service_address_id | uuid | no | FK → `service_addresses.id`, on delete restrict |
| sequence_number | smallint | no | stop order — the one place a numbered marker belongs, per the design doc |
| created_at / updated_at | timestamptz | no | |

Unique: `(route_id, sequence_number)`, `(route_id, service_address_id)`.

### `daily_assignments`
Purpose: the concrete dispatch plan for one route on one date — "Westlands
AM runs today, here's the plan." This is what a driver's app queries for
"today's route."

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| route_id | uuid | no | FK → `routes.id`, on delete restrict |
| assignment_date | date | no | |
| status | enum(`planned`,`dispatched`,`in_progress`,`completed`,`cancelled`) | no | default `planned` |
| created_at / updated_at | timestamptz | no | |

Unique: `(route_id, assignment_date)`.

### `driver_assignments`
Purpose: **who actually drove** a `daily_assignment` — kept separate from
`daily_assignments` itself so a mid-day driver/vehicle swap (breakdown,
sickness) is a new row, not a mutated one, preserving "who was really
driving at 10am" for GPS/photo evidence disputes.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| daily_assignment_id | uuid | no | FK → `daily_assignments.id`, on delete cascade |
| driver_id | uuid | no | FK → `drivers.id`, on delete restrict |
| vehicle_id | uuid | no | FK → `vehicles.id`, on delete restrict |
| started_at | timestamptz | yes | |
| ended_at | timestamptz | yes | null = still the active leg for this assignment |
| created_at | timestamptz | no | immutable |

Indexes: `daily_assignment_id`, `driver_id`, `vehicle_id`.

### `collections`
Purpose: the ground-truth record of a collection at one stop, one date —
the single most important operational row in the system; invoices trace
back to these.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| daily_assignment_id | uuid | yes | FK → `daily_assignments.id`, on delete restrict — null only for a collection that never got dispatched (should be rare and reviewed) |
| service_address_id | uuid | no | FK → `service_addresses.id`, on delete restrict |
| subscription_id | uuid | yes | FK → `subscriptions.id`, on delete restrict — null for ad-hoc requests |
| collection_request_id | uuid | yes | FK → `waste_collection_requests.id`, on delete restrict — null for scheduled subscription collections |
| scheduled_date | date | no | |
| status | enum(`scheduled`,`assigned`,`in_progress`,`completed`,`failed`,`rescheduled`) | no | default `scheduled` — see §B for the full transition graph |
| arrived_at / completed_at | timestamptz | yes | |
| weight_kg | numeric(8,2) | yes | if weighed |
| created_at / updated_at | timestamptz | no | |

Indexes: `service_address_id`, `subscription_id`, `scheduled_date`, `status`.
Check constraint: exactly one of `subscription_id` /
`collection_request_id` is non-null (a collection always traces to either
the recurring schedule or an ad-hoc request, never both, never neither).

### `collection_status_events`
Purpose: domain-specific status-transition history for `collections`,
separate from the generic `audit_log` because it validates *which*
transitions are legal (§B) and carries a reason code — `audit_log` records
"the row changed," this records "why, per the state machine."

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| collection_id | uuid | no | FK → `collections.id`, on delete cascade |
| from_status | text | yes | null for the initial `scheduled` event |
| to_status | text | no | |
| reason_code | text | yes | e.g. `gate_locked`, `customer_absent`, `bin_not_out` |
| actor_id | uuid | yes | FK → `profiles.id`, on delete set null |
| created_at | timestamptz | no | immutable |

Indexes: `collection_id`.

### `failed_collections`
Purpose: detail extension for a `collections` row whose status is `failed`
— the reason and what happens next.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| collection_id | uuid | no | FK → `collections.id`, on delete cascade, unique (1:1) |
| reason_code | text | no | |
| notes | text | yes | |
| rescheduled_collection_id | uuid | yes | FK → `collections.id`, on delete set null — the new `collections` row created for the retry |
| created_at | timestamptz | no | |

### `collection_evidence`
Purpose: photos/GPS proof captured by the driver app at a collection.
**Not audited** (it is itself the evidentiary record; a separate audit trail
of "someone looked at this photo" adds no protective value).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| collection_id | uuid | no | FK → `collections.id`, on delete cascade |
| document_id | uuid | no | FK → `documents.id`, on delete restrict — the actual photo file |
| latitude / longitude | double precision | yes | |
| captured_at | timestamptz | no | |
| created_at | timestamptz | no | |

Indexes: `collection_id`.

---

## 5. FLEET

### `vehicles`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| registration_number | text | no | unique |
| vehicle_type | text | yes | e.g. "compactor truck", "skip truck" |
| capacity_kg | numeric(8,2) | yes | |
| status | enum(`active`,`in_maintenance`,`out_of_service`) | no | default `active` — current status; history in `vehicle_status_history` |
| created_at / updated_at | timestamptz | no | |

### `drivers`
Purpose: the fleet-facing extension of a staff member who drives. Kept
separate from `staff_profiles` because not every staff member is a driver,
and driver-specific fields (license) don't belong on the generic staff row.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK, FK → `staff_profiles.id`, on delete restrict |
| license_number | text | no | unique |
| license_expiry | date | no | |
| status | enum(`active`,`suspended`,`inactive`) | no | default `active` |
| created_at / updated_at | timestamptz | no | |

### `vehicle_status_history`
Purpose: audit trail of vehicle status changes (into/out of maintenance,
decommissioning) — `vehicles.status` is "now," this is "when and why it
changed."

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| vehicle_id | uuid | no | FK → `vehicles.id`, on delete cascade |
| from_status | text | yes | |
| to_status | text | no | |
| reason | text | yes | |
| changed_by | uuid | yes | FK → `profiles.id`, on delete set null |
| created_at | timestamptz | no | immutable |

### `maintenance_records`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| vehicle_id | uuid | no | FK → `vehicles.id`, on delete restrict |
| maintenance_type | text | no | e.g. "service", "repair", "tyres" |
| description | text | yes | |
| cost_cents | bigint | yes | |
| currency | char(3) | no | default `'KES'` |
| odometer_km | integer | yes | |
| performed_at | date | no | |
| next_due_date | date | yes | |
| created_at / updated_at | timestamptz | no | |

Indexes: `vehicle_id`, `next_due_date` (for maintenance-due reporting).

---

## 6. FINANCE

Financial tables are the strictest in the schema: immutable once posted,
`force row level security`, and every mutation audited. Corrections happen
by posting an offsetting/reversing row, never by editing history — this is
what "auditable and immutable where required" (rule 2) means concretely.

### `invoices`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| invoice_number | text | no | unique, human-facing, sequential per year |
| issue_date | date | no | |
| due_date | date | no | |
| status | enum(`draft`,`issued`,`partially_paid`,`paid`,`overdue`,`void`) | no | default `draft` |
| subtotal_cents | bigint | no | |
| tax_cents | bigint | no | default 0 |
| total_cents | bigint | no | = subtotal + tax, enforced by check constraint |
| currency | char(3) | no | default `'KES'` |
| voided_reason | text | yes | required (app-level) when status = `void` |
| created_at / updated_at | timestamptz | no | `updated_at` only moves for status transitions once `issued` — line items and totals are immutable after issue (see §C) |

Unique: `invoice_number`. Indexes: `customer_id`, `status`, `due_date`.

### `invoice_items`
Purpose: line items — always traceable to the operational or subscription
event that generated them, never a bare free-text amount.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| invoice_id | uuid | no | FK → `invoices.id`, on delete cascade |
| subscription_id | uuid | yes | FK → `subscriptions.id`, on delete restrict |
| collection_id | uuid | yes | FK → `collections.id`, on delete restrict — for usage-based/ad-hoc items |
| description | text | no | |
| quantity | numeric(10,2) | no | default 1 |
| unit_price_cents | bigint | no | |
| amount_cents | bigint | no | = quantity × unit_price, enforced by check constraint |
| created_at | timestamptz | no | immutable once the parent invoice is `issued` |

Indexes: `invoice_id`.

### `payments`
Purpose: a received payment event, method-agnostic. `payment_method`
distinguishes M-Pesa/cheque/cash/bank-transfer; method-specific detail
lives in the PAYMENTS domain tables below, FK'd back to this row.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| payment_method | enum(`mpesa`,`cheque`,`cash`,`bank_transfer`) | no | |
| amount_cents | bigint | no | |
| currency | char(3) | no | default `'KES'` |
| status | enum(`pending`,`confirmed`,`failed`,`reversed`) | no | default `pending` |
| received_at | timestamptz | no | |
| reference | text | yes | free-text/method reference, e.g. bank slip number |
| created_at / updated_at | timestamptz | no | |

Indexes: `customer_id`, `status`, `received_at`.

### `payment_allocations`
Purpose: how a payment's amount is applied across one or more invoices —
this is what makes partial payments, overpayments, and "one payment covers
two invoices" possible without ever editing an invoice's own amount.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| payment_id | uuid | no | FK → `payments.id`, on delete restrict |
| invoice_id | uuid | no | FK → `invoices.id`, on delete restrict |
| amount_cents | bigint | no | portion of the payment applied to this invoice |
| created_at | timestamptz | no | immutable |

Indexes: `payment_id`, `invoice_id`. Check (app + trigger level): sum of a
payment's allocations never exceeds `payments.amount_cents`; sum of an
invoice's allocations never exceeds `invoices.total_cents`.

### `receipts`
Purpose: the customer-facing issued receipt — immutable once generated,
because it may already be in the customer's hands.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| payment_id | uuid | no | FK → `payments.id`, on delete restrict |
| receipt_number | text | no | unique, sequential |
| document_id | uuid | yes | FK → `documents.id`, on delete set null — generated PDF |
| issued_at | timestamptz | no | |
| created_at | timestamptz | no | immutable |

Unique: `receipt_number`.

### `ledger_entries`
Purpose: double-entry accounting rows, per customer account (see
**Decision 4** — full double-entry is recommended over a simple running
balance). Immutable and append-only; a correction is a new offsetting
entry, never an edit.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| financial_transaction_id | uuid | no | FK → `financial_transactions.id`, on delete restrict — the business event this entry realizes |
| entry_type | enum(`debit`,`credit`) | no | |
| amount_cents | bigint | no | always positive; sign is carried by `entry_type` |
| currency | char(3) | no | default `'KES'` |
| description | text | no | |
| created_at | timestamptz | no | immutable |

Indexes: `customer_id`, `financial_transaction_id`. Invariant (enforced by a
trigger, not just app code): for a given `financial_transaction_id`, sum of
debits = sum of credits.

### `financial_transactions`
Purpose: the append-only business-event log that `ledger_entries` are
generated from — "an invoice was issued," "a payment was received," "a
refund was issued," "a manual adjustment was made." This is the
single source of truth for *why* money moved; `ledger_entries` is its
accounting projection.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| transaction_type | enum(`invoice_issued`,`payment_received`,`refund_issued`,`adjustment`,`write_off`) | no | |
| reference_table | text | no | e.g. `'invoices'`, `'payments'` |
| reference_id | uuid | no | the row in that table |
| amount_cents | bigint | no | |
| currency | char(3) | no | default `'KES'` |
| notes | text | yes | required (app-level) for `adjustment`/`write_off` |
| created_by | uuid | yes | FK → `profiles.id`, on delete set null — null for system-generated (e.g. auto invoice issuance) |
| created_at | timestamptz | no | immutable |

Indexes: `customer_id`, `(reference_table, reference_id)`, `transaction_type`.

---

## 7. PAYMENTS (M-Pesa, cheque, reconciliation)

### `mpesa_payment_intents`
Purpose: created the moment an STK Push is initiated, **before** any
confirmation — this is what makes the M-Pesa flow idempotent (rule 3): the
app generates `idempotency_key` client-side before calling Daraja, so a
retried request never double-initiates.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete restrict |
| invoice_id | uuid | yes | FK → `invoices.id`, on delete restrict — null for a general account top-up not yet allocated |
| idempotency_key | text | no | unique — client-generated, retried requests reuse it |
| amount_cents | bigint | no | |
| phone_number | text | no | |
| merchant_request_id | text | yes | Daraja's ID, set once the STK push call returns |
| checkout_request_id | text | yes | Daraja's ID, unique when present — this is the real idempotency anchor once Daraja has responded |
| status | enum(`initiated`,`pending`,`completed`,`failed`,`expired`) | no | default `initiated` |
| created_at / updated_at | timestamptz | no | |

Unique: `idempotency_key`, `checkout_request_id` (partial, where not null).

### `mpesa_transactions`
Purpose: the confirmed M-Pesa transaction once Daraja calls back —
immutable, and the natural idempotency key is Safaricom's own receipt
number.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| payment_intent_id | uuid | no | FK → `mpesa_payment_intents.id`, on delete restrict |
| payment_id | uuid | yes | FK → `payments.id`, on delete restrict — set once reconciled into `payments` |
| mpesa_receipt_number | text | no | **unique** — Safaricom's own idempotent transaction ID; a duplicate callback with the same receipt number is a no-op, not a new row |
| amount_cents | bigint | no | |
| transacted_at | timestamptz | no | |
| phone_number | text | no | |
| created_at | timestamptz | no | immutable |

Unique: `mpesa_receipt_number`. This is the actual idempotency guarantee —
inserting with `on conflict (mpesa_receipt_number) do nothing`.

### `mpesa_callback_records`
Purpose: the raw Daraja callback payload, logged verbatim before any
parsing/business logic runs. **Not audited** via `audit_log` (it's already
an immutable raw-payload log; auditing an audit table is redundant) but
absolutely never deleted — this is the forensic record if a reconciliation
dispute happens.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| payment_intent_id | uuid | yes | FK → `mpesa_payment_intents.id`, on delete set null — may be unresolvable if the callback references an unknown request |
| raw_payload | jsonb | no | the full callback body, untouched |
| received_at | timestamptz | no | |
| processed_at | timestamptz | yes | null until successfully handled |
| processing_error | text | yes | |
| created_at | timestamptz | no | immutable |

Indexes: `payment_intent_id`, `processed_at` (to find unprocessed
callbacks).

### `cheque_payments`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| payment_id | uuid | no | FK → `payments.id`, on delete restrict |
| cheque_number | text | no | |
| bank_name | text | no | |
| deposited_date | date | no | |
| cleared_date | date | yes | |
| status | enum(`pending_clearance`,`cleared`,`bounced`) | no | default `pending_clearance` |
| created_at / updated_at | timestamptz | no | |

Unique: `(bank_name, cheque_number)`.

### `reconciliation_batches`
Purpose: a single reconciliation run (daily M-Pesa settlement report,
monthly bank statement) — groups the items it matched.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| batch_type | enum(`mpesa_settlement`,`bank_statement`) | no | |
| period_start / period_end | date | no | |
| status | enum(`open`,`completed`,`completed_with_exceptions`) | no | default `open` |
| performed_by | uuid | yes | FK → `profiles.id`, on delete set null |
| created_at / updated_at | timestamptz | no | |

### `reconciliation_items`
Purpose: individual matches (or exceptions) within a batch.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| batch_id | uuid | no | FK → `reconciliation_batches.id`, on delete cascade |
| payment_id | uuid | yes | FK → `payments.id`, on delete set null |
| external_reference | text | no | the settlement-report/bank-statement line reference |
| amount_cents | bigint | no | |
| match_status | enum(`matched`,`unmatched`,`disputed`) | no | default `unmatched` |
| notes | text | yes | |
| created_at | timestamptz | no | |

Indexes: `batch_id`, `payment_id`.

---

## 8. DOCUMENTS

### `documents`
Purpose: the single generic file registry — everything else (contracts,
receipts, collection photos, staff licenses) points here rather than
storing its own storage path, so storage/retention policy lives in one
place.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| storage_path | text | no | Supabase Storage object path |
| file_name | text | no | original filename |
| mime_type | text | no | |
| size_bytes | bigint | no | |
| checksum | text | yes | for de-dupe/integrity checks |
| uploaded_by | uuid | yes | FK → `profiles.id`, on delete set null |
| created_at | timestamptz | no | |

### `customer_documents`
Purpose: typed link between a document and a customer (contract PDF, ID
copy, KRA PIN certificate).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| customer_id | uuid | no | FK → `customers.id`, on delete cascade |
| document_id | uuid | no | FK → `documents.id`, on delete restrict |
| document_type | enum(`contract`,`id_copy`,`kra_pin`,`other`) | no | |
| created_at | timestamptz | no | |

Indexes: `customer_id`, `document_type`.

### `staff_documents`
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| staff_profile_id | uuid | no | FK → `staff_profiles.id`, on delete cascade |
| document_id | uuid | no | FK → `documents.id`, on delete restrict |
| document_type | enum(`id_copy`,`drivers_license`,`certification`,`other`) | no | |
| expiry_date | date | yes | for licenses/certifications |
| created_at | timestamptz | no | |

Indexes: `staff_profile_id`, `expiry_date` (for expiry reminders).

---

## 9. COMMUNICATION

### `notifications`
Purpose: a message to be sent (or already sent) to a recipient — invoice
issued, payment received, collection reminder, collection failed.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| recipient_profile_id | uuid | yes | FK → `profiles.id`, on delete set null — null for a notification sent to a raw `customer_contacts` email with no login |
| recipient_customer_contact_id | uuid | yes | FK → `customer_contacts.id`, on delete set null |
| channel | enum(`sms`,`email`,`push`) | no | |
| template_code | text | no | e.g. `invoice_issued`, `collection_failed` |
| related_table | text | yes | e.g. `'invoices'` |
| related_id | uuid | yes | |
| status | enum(`queued`,`sent`,`failed`) | no | default `queued` |
| created_at / updated_at | timestamptz | no | |

Check: exactly one of `recipient_profile_id` /
`recipient_customer_contact_id` is set.

### `notification_deliveries`
Purpose: per-attempt delivery status from the provider (Africa's Talking,
email provider) — a notification can have more than one attempt.
**Not audited** (it is itself the delivery audit trail).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| notification_id | uuid | no | FK → `notifications.id`, on delete cascade |
| provider | text | no | |
| provider_message_id | text | yes | |
| status | enum(`sent`,`delivered`,`failed`,`bounced`) | no | |
| error_message | text | yes | |
| attempted_at | timestamptz | no | |
| created_at | timestamptz | no | |

Indexes: `notification_id`.

---

## 10. SYSTEM

### `audit_log`
Already exists (foundation migration): generic append-only row-change log,
populated by `public.log_audit_event()` triggers attached per-table as each
table above is created. No changes needed here beyond attaching the trigger
to every audited table listed above.

### `operational_events`
Purpose: a business-level event stream — distinct from `audit_log`, which
records "row X changed." This records *operationally meaningful* events for
dashboards/timelines regardless of whether they map to a single row change
(e.g. `route_dispatched`, `vehicle_breakdown_reported`,
`reconciliation_completed`). See **Decision 6** on whether this table earns
its keep versus deriving the same views from `audit_log` + domain tables.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | PK |
| event_type | text | no | |
| related_table | text | yes | |
| related_id | uuid | yes | |
| payload | jsonb | yes | event-specific detail |
| actor_id | uuid | yes | FK → `profiles.id`, on delete set null |
| created_at | timestamptz | no | immutable |

Indexes: `event_type`, `(related_table, related_id)`, `created_at`.

---

## A. Entity relationship flow

```
customers ──< contracts ──< subscriptions ──< collection_schedules
    │                            │
    │                            ├──< collections >── daily_assignments ── routes
    │                            │        │                                  │
    │                            │        └──< collection_evidence     route_stops ── service_addresses
    │                            │        └──< failed_collections            │
    │                            │                                     (via schedules)
    │                            └──< invoice_items ── invoices
    │
    ├──< invoices ──< invoice_items
    │       │
    │       └──< payment_allocations >── payments ──< (mpesa_transactions | cheque_payments)
    │
    └──< financial_transactions ──< ledger_entries
```

Read left-to-right, top-to-bottom as the brief's flow:
**Customer → Contract → Subscription → Scheduled Collection → Actual
Collection → Invoice → Payment → Ledger Entry.**

1. A `customer` signs a `contract`.
2. The contract has one or more `subscriptions` (a service at a specific
   `service_address`, at a `service_plan` price).
3. A subscription produces a recurring `collection_schedule`, which is the
   template `collections` rows get created from (or a
   `waste_collection_request` creates one off-schedule).
4. Each scheduled `collection` is dispatched via a `daily_assignment`
   (route + date) and carried out by a `driver_assignment`; its outcome is
   recorded on the `collections` row itself (§B has the full status graph).
5. Completed collections (and subscription line items generally) become
   `invoice_items` on an `invoice`.
6. A `payment` (M-Pesa/cheque/cash/bank transfer) is recorded, then
   allocated to one or more invoices via `payment_allocations`.
7. Every money-moving event (`invoice_issued`, `payment_received`,
   `refund_issued`, `adjustment`) is recorded as a `financial_transaction`,
   which generates balanced `ledger_entries` — the accounting system of
   record.

---

## B. Status transition rules

State machines below are the *complete* legal transition set for each
status column — anything not listed is invalid and must be rejected by a
trigger (or check constraint where the graph is simple enough), not just
application code, since triggers are what actually protect data integrity
under concurrent writes.

### `collections.status`
```
scheduled → assigned → in_progress → completed
scheduled → assigned → failed → rescheduled
assigned  → in_progress → failed → rescheduled
scheduled → (cancelled — via the parent subscription/request being cancelled, not a direct status value; see note)
```
- `rescheduled` is terminal for *this* row — a new `collections` row is
  created (linked via `failed_collections.rescheduled_collection_id`) and
  starts again at `scheduled`.
- There is no direct `cancelled` value on `collections` itself in this
  design — a collection is cancelled by cancelling its parent
  `waste_collection_request`, which leaves the (never-created) collection
  simply absent, or if already `scheduled`, by transitioning to `failed`
  with `reason_code = 'cancelled_by_customer'`. Flagged for confirmation —
  see **Decision 8** if a first-class `cancelled` status is preferred
  instead.
- Every transition writes a `collection_status_events` row.

### `invoices.status`
```
draft → issued → partially_paid → paid
draft → issued → paid
issued → overdue                (system, past due_date with balance > 0)
overdue → partially_paid → paid
issued | overdue | partially_paid → void   (requires voided_reason)
```
- `draft → issued` is the point of no return for line items: once `issued`,
  `invoice_items` become immutable (rule 2). Corrections after issue happen
  via a `financial_transactions` `adjustment` and a new/credit invoice, not
  by editing the issued one.
- `void` is the only way to invalidate an issued invoice; a void invoice's
  outstanding balance must be zero after a matching `adjustment`
  transaction — it does not silently vanish from the ledger.

### `subscriptions.status`
```
pending → active → paused → active
active → paused → cancelled
active → cancelled
pending → cancelled
```
Every transition writes a `subscription_history` row.

### `mpesa_payment_intents.status`
```
initiated → pending → completed
initiated → pending → failed
pending → expired            (system, timeout with no callback)
```
`completed` fires the creation of an `mpesa_transactions` row (idempotent
on `mpesa_receipt_number`) and a `payments` row.

### `contracts.status`
```
draft → active → expired
draft → active → terminated
active → terminated
```

---

## C. Financial rules

**Invoice creation.** Invoices are generated from completed collections and
active subscription billing cycles, never hand-typed as a bare total. Every
`invoice_items` row traces to a `subscription_id` and/or `collection_id`.
An invoice starts `draft` (editable) and becomes immutable at `issued`.
`subtotal_cents`/`total_cents` are computed from the sum of items at issue
time and stored (not recomputed on read), so an invoice is a durable
snapshot even if a `service_plan_prices` row changes later.

**Payment allocation.** A `payments` row is never directly "for" one
invoice — it is allocated via `payment_allocations`, which is what supports
one payment covering several invoices, or a partial amount going to the
oldest outstanding invoice first (standard aging-based allocation, applied
by the billing job unless a human picks a different invoice in Finance
tooling). Sum of allocations for a payment can never exceed the payment's
amount; the unallocated remainder is a customer credit balance, tracked by
its `financial_transactions`/`ledger_entries` rows against that customer,
not a separate "wallet" table (keeps one system of record for balances).

**Partial payments.** An invoice moves to `partially_paid` the moment the
sum of its allocations is greater than zero and less than `total_cents`,
and to `paid` when it reaches `total_cents`. This is a derived status,
recomputed by a trigger on `payment_allocations` insert — never set
directly by application code, so it can't drift from the actual allocation
total.

**Failed payments.** An `mpesa_payment_intents` row that resolves `failed`
(explicit Daraja failure) or `expired` (timeout) never creates a `payments`
row — there is nothing to reconcile. The customer-facing retry is a new
payment intent with a new `idempotency_key`, not a retry of the failed one.

**Refunds.** Modeled as a `financial_transactions` row of type
`refund_issued`, generating a `ledger_entries` credit against the customer
and — where the refund is actually returned (e.g. M-Pesa B2C payout, bank
transfer) — a corresponding `payments`-adjacent record (flagged as
**Decision 9**: whether refund payouts get their own
`refund_payouts` table mirroring `payments`, or reuse `payments` with a
negative-flow `payment_method`/direction column; this document defaults to
recommending a dedicated `refund_payouts` table for clarity, not yet
designed in detail here pending that decision).

**Reconciliation.** `reconciliation_batches`/`reconciliation_items` match
`payments` rows (mostly `mpesa_transactions`-backed) against Safaricom
settlement reports or bank statements. An `unmatched` or `disputed` item
blocks that batch from `status = completed` (it lands at
`completed_with_exceptions` instead) — reconciliation is a Finance-role
action, never automatic silent write-off.

---

## D. RLS policy requirements

General shape for every table: `select` policy scoped by role/ownership as
below; `insert`/`update` restricted to the roles listed as able to
create/update in §"Role access" (per-domain, not repeated per table here);
`delete` policy omitted everywhere except reference tables
(`roles`,`permissions`,`service_plans`, etc.) — application flow never
issues `DELETE` on operational/financial rows, per §0.

- **IDENTITY** (`profiles`, `staff_profiles`, `customer_profiles`): a user
  can `select`/`update` their own row (`id = auth.uid()`); staff roles
  (`super_admin`,`admin`) can `select` all; only `super_admin`/`admin` can
  `insert` (account provisioning is staff-initiated, matching
  `supabase/config.toml`'s `enable_signup = false`).
- **CUSTOMERS** (`customers`, `customer_contacts`, `properties`,
  `service_addresses`): a `customer`-role user can `select` only rows where
  `customer_id = auth.customer_id()`; staff roles per §"Role access" below;
  `operations_manager`/`driver` get `select` only on `service_addresses`
  (they need the collection point, not the customer's billing profile).
- **COMMERCIAL** (`contracts`, `subscriptions`, pricing): customer can
  `select` their own; only `admin`/`finance` can `insert`/`update` pricing
  and contracts; `operations_manager` can `select` subscriptions (needed for
  scheduling) but not create/edit commercial terms.
- **OPERATIONS**: `driver` can `select`/`update` only `collections` /
  `daily_assignments` / `driver_assignments` rows where they are the
  assigned driver for that date (`driver_assignments.driver_id =
  auth.uid()`'s linked `drivers.id`); a driver cannot see another driver's
  route. `customer` can `select` only `collections` tied to their own
  `service_addresses`, and only `waste_collection_requests` they created
  (and can `insert` those, not `update` once `submitted`).
  `operations_manager` gets full `select`/`insert`/`update` on this whole
  domain.
- **FLEET**: staff-only (`operations_manager`,`admin`,`super_admin`); no
  customer or driver `select` on `maintenance_records`/`vehicle_status_history`
  (drivers see their *own* current vehicle via `driver_assignments`, not
  the fleet's maintenance history).
- **FINANCE / PAYMENTS**: strictest domain. `force row level security`
  everywhere. `customer` can `select` only their own `invoices`,
  `payment_allocations`→`invoices` chain, and `receipts` — never
  `ledger_entries` or `financial_transactions` directly (those are internal
  accounting rows; a customer-facing "statement of account" is a computed
  view, not raw table access — flagged as **Decision 10**, a view/RPC to
  design once schema lands). Only `finance`/`admin`/`super_admin` can
  `insert`/`update` anything in this domain. `mpesa_callback_records` and
  `reconciliation_*` are `finance`/`admin`-only, no customer access at all.
- **DOCUMENTS**: a customer can `select` only their own
  `customer_documents` (joined) and `insert` documents attached to
  themselves (e.g. uploading an ID); staff documents are staff-only.
- **COMMUNICATION**: a user can `select` only notifications addressed to
  them; only staff roles insert notifications (the app/background job,
  running as service role, is the real writer here — see below).
- **SYSTEM** (`audit_log`, `operational_events`): `super_admin`/`admin`
  read-only; no other role gets any access at all. No `insert`/`update`
  policy for any role — these are written exclusively by triggers and
  service-role background jobs, which bypass RLS by design.

**Service-role bypass**: scheduled jobs (billing runs, M-Pesa reconciliation
polling, notification dispatch) run under the Supabase service-role key
(`createSupabaseServiceRoleClient()`, already in the foundation code) and
intentionally bypass RLS — this is correct and expected for
system-initiated writes, not a hole, since that key never reaches the
browser.

---

## Role access summary

| Domain | `super_admin` | `admin` | `finance` | `operations_manager` | `driver` | `customer` |
|---|---|---|---|---|---|---|
| Identity/staff accounts | Full | Full | Read own | Read own | Read own | — |
| Customers/properties | Full | Full | Read | Read | Read (address only) | Own record only |
| Contracts/subscriptions/pricing | Full | Full | Full | Read | — | Read own |
| Schedules/routes/assignments | Full | Read | — | Full | Read own day | — |
| Collections | Full | Read | Read | Full | Own assigned only (view + update status/evidence) | Own address's, read-only |
| Waste collection requests | Full | Full | — | Full | — | Create/read own |
| Fleet/maintenance | Full | Read | — | Full | Read own current vehicle | — |
| Invoices/invoice items | Full | Read | Full | — | — | Read own |
| Payments/allocations/receipts | Full | Read | Full | — | — | Read own |
| M-Pesa/cheque/reconciliation | Full | Read | Full | — | — | — |
| Ledger/financial transactions | Full | Read | Full | — | — | — |
| Documents (customer) | Full | Full | Read | — | — | Own only |
| Documents (staff) | Full | Full | — | Read own | Read own | — |
| Notifications | Full | Full | Read own | Read own | Read own | Read own |
| Audit log / operational events | Full | Read | — | — | — | — |

"Full" = view + create + update (never raw delete, per §0). "—" = no
access at all (not even read) via RLS; the corresponding UI area simply
doesn't render that data for that role.

---

## Architecture decisions requiring approval

These need a decision before migrations are written; each has a
recommendation, but none has been assumed as final.

1. **Role model reconciliation.** The foundation code's role list
   (`super_admin, admin, staff, finance, support, operations, driver,
   customer_individual, customer_corporate` in `src/types/roles.ts`) differs
   from this task's role list (`super_admin, admin, finance,
   operations_manager, driver, customer`). This document designs against
   the **new, 6-role list**, folding `staff`/`support`/`operations` into
   `admin`/`operations_manager` as appropriate, and representing
   individual-vs-corporate not as separate roles but as
   `customers.customer_type`. *Recommendation*: adopt the 6-role model as
   canonical and update `src/types/roles.ts`, `AREA_ACCESS`, and
   `src/middleware.ts` to match when schema work begins — otherwise the app
   layer and the database layer disagree about what a role even is.

2. **`operations_manager` route-area mapping.** The current
   `AREA_ACCESS` matrix in code only knows `admin`/`driver`/`portal` areas.
   `operations_manager` (and `finance`) need `/admin` access with
   in-area feature restrictions (§ Role access) rather than a new top-level
   area — confirm that's the intended UX (one `/admin` area, permission-
   gated inside) versus splitting into separate URL areas per staff role.

3. **RLS authority source: JWT claim vs. `profiles` table.** The existing
   `getCurrentUser()`/middleware code reads role from
   `user.app_metadata.role` (a JWT claim). This document's RLS design
   (§0, "RLS role-identity model") instead reads role from `profiles` via a
   `security definer` helper function, so a role change takes effect
   immediately rather than waiting for token refresh. *Recommendation*:
   switch the authority to `profiles`, and keep `app_metadata.role` (if
   kept at all) purely as a UX hint for middleware, never as the RLS
   source of truth. This is a real code change to existing
   `src/lib/auth/session.ts` and `src/middleware.ts`, not just new tables.

4. **Ledger design: full double-entry vs. running balance.** This document
   designs `ledger_entries` as true double-entry (debit/credit rows that
   must balance per transaction). *Recommendation*: keep double-entry — it
   is the only design that makes "prove the books balance" a query rather
   than an assumption, which matters for a real business's finance
   function. The alternative (a single running-balance column on
   `customers`) is simpler to build but far weaker for audit.

5. *(see #3 above — numbering kept sequential with the RLS section
   reference)*

6. **`operational_events` vs. deriving dashboards from `audit_log` +
   domain tables.** *Recommendation*: keep it, but treat it as optional
   scope for the first schema migration — it has no hard dependents (unlike
   every other table above) and can be added later without touching
   anything else.

7. **Geo/PostGIS.** `properties`/`service_addresses` use plain
   `double precision` lat/lng, not PostGIS `geography`. Fine for storing a
   pin and simple bounding-box queries; **not** sufficient for real
   route-optimization (nearest-neighbor, drive-time) later. *Recommendation*:
   ship plain lat/lng now, revisit PostGIS when route optimization becomes
   a real feature rather than speculatively adding the extension now.

8. **`collections` cancellation.** No first-class `cancelled` value on
   `collections.status` (see §B) — a cancelled collection is represented as
   `failed` with a specific `reason_code`. *Recommendation*: confirm this
   is acceptable for reporting (a "failed" bucket that includes
   customer-initiated cancellations) versus wanting `cancelled` as a
   distinct, non-"failure" status for driver-performance metrics.

9. **Refund payouts.** Refund money-*out* (M-Pesa B2C, bank transfer) is
   flagged but not fully designed in §C — needs a decision on a dedicated
   `refund_payouts` table (recommended) vs. overloading `payments` with a
   direction flag before that part of the schema is finalized.

10. **Customer-facing statement of account.** Customers get no direct RLS
    access to `ledger_entries`/`financial_transactions` (§D). A
    "statement of account" view needs to be either a Postgres `view`
    (RLS-friendly, recomputed on read) or a materialized/derived table
    refreshed by a job. *Recommendation*: a plain `view` joining
    `invoices`+`payment_allocations`+`receipts` scoped by
    `auth.customer_id()` — no need for `ledger_entries` access at all for
    this use case, since a statement is really "invoices and payments,"
    not "the accountant's double-entry books."

---

**Next step, once the above is reviewed and any decisions are resolved:**
write the actual SQL migration(s) implementing this schema, in dependency
order (IDENTITY → CUSTOMERS → COMMERCIAL → FLEET → OPERATIONS → FINANCE →
PAYMENTS → DOCUMENTS → COMMUNICATION → SYSTEM), each with its RLS policies
and audit triggers attached in the same migration that creates the table —
not deferred to a later pass.
