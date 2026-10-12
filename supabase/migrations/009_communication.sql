-- 009_communication.sql
-- COMMUNICATION domain. Depends on 001 (profiles), 002 (customer_contacts).

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.notification_channel as enum ('sms', 'email', 'push');
create type public.notification_status as enum ('queued', 'sent', 'failed');
create type public.notification_delivery_status as enum
  ('sent', 'delivered', 'failed', 'bounced');

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------

create table public.notifications (
  id                              uuid primary key default gen_random_uuid(),
  recipient_profile_id            uuid references public.profiles (id) on delete set null,
  recipient_customer_contact_id   uuid references public.customer_contacts (id) on delete set null,
  channel                         public.notification_channel not null,
  template_code                   text not null,
  related_table                   text,
  related_id                      uuid,
  status                          public.notification_status not null default 'queued',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  check (
    (recipient_profile_id is not null and recipient_customer_contact_id is null)
    or (recipient_profile_id is null and recipient_customer_contact_id is not null)
  )
);

create index notifications_recipient_profile_id_idx on public.notifications (recipient_profile_id);
create index notifications_recipient_customer_contact_id_idx
  on public.notifications (recipient_customer_contact_id);
create index notifications_related_idx on public.notifications (related_table, related_id);

create trigger set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

create trigger audit_notifications
  after insert or update or delete on public.notifications
  for each row execute function public.log_audit_event();

-- ---------------------------------------------------------------------
-- notification_deliveries
-- ---------------------------------------------------------------------

create table public.notification_deliveries (
  id                    uuid primary key default gen_random_uuid(),
  notification_id       uuid not null references public.notifications (id) on delete cascade,
  provider              text not null,
  provider_message_id   text,
  status                public.notification_delivery_status not null,
  error_message         text,
  attempted_at          timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

comment on table public.notification_deliveries is
  'Per-attempt delivery status from the provider. Not itself audited via '
  'log_audit_event - it is already the delivery audit trail.';

create index notification_deliveries_notification_id_idx
  on public.notification_deliveries (notification_id);

-- ---------------------------------------------------------------------
-- RLS: enable now, policies in 011_rls_policies.sql
-- ---------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
