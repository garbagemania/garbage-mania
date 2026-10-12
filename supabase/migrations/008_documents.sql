-- 008_documents.sql
-- DOCUMENTS domain link tables. The generic `documents` registry itself
-- already exists (created in 001_identity.sql - see MIGRATION_PLAN.md
-- §0.1). Depends on 001 (documents, profiles), 002 (customers), 004
-- (staff_profiles is in 001 too, referenced here).

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.customer_document_type as enum
  ('contract', 'id_copy', 'kra_pin', 'other');
create type public.staff_document_type as enum
  ('id_copy', 'drivers_license', 'certification', 'other');

-- ---------------------------------------------------------------------
-- customer_documents
-- ---------------------------------------------------------------------

create table public.customer_documents (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  document_id     uuid not null references public.documents (id) on delete restrict,
  document_type   public.customer_document_type not null,
  created_at      timestamptz not null default now()
);

create index customer_documents_customer_id_idx on public.customer_documents (customer_id);
create index customer_documents_document_type_idx on public.customer_documents (document_type);

create trigger audit_customer_documents
  after insert or update or delete on public.customer_documents
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- staff_documents
-- ---------------------------------------------------------------------

create table public.staff_documents (
  id                 uuid primary key default gen_random_uuid(),
  staff_profile_id   uuid not null references public.staff_profiles (id) on delete cascade,
  document_id        uuid not null references public.documents (id) on delete restrict,
  document_type      public.staff_document_type not null,
  expiry_date        date,
  created_at         timestamptz not null default now()
);

create index staff_documents_staff_profile_id_idx on public.staff_documents (staff_profile_id);
create index staff_documents_expiry_date_idx on public.staff_documents (expiry_date);

create trigger audit_staff_documents
  after insert or update or delete on public.staff_documents
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- RLS: enable now, policies in 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.customer_documents enable row level security;
alter table public.staff_documents enable row level security;
