-- 018_customer_portal_hardening.sql
--
-- Promoted from supabase/proposed/. Every change tightens access; nothing
-- relaxes an existing policy. NOT yet executed against a database - run
-- `supabase db reset` and `supabase test db` before relying on it.
-- Background for each item: PORTAL_CUSTOMER_REVIEW.md, "Backend findings".

-- 1. Customers can currently UPDATE any column of their own customers row
--    (customers_update_own is row-level only - see the comment on that policy
--    in 016). That includes `status` (a suspended customer could set
--    themselves back to 'active'), `notes` (internal) and `kra_pin`.
create or replace function public.guard_customer_self_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if public.user_role() = 'customer' then
    if new.status is distinct from old.status
       or new.notes is distinct from old.notes then
      raise exception 'Customers cannot change account status or internal notes';
    end if;
    -- Onboarding legitimately sets the PIN once (null -> value); after that
    -- only staff may change it.
    if old.kra_pin is not null and new.kra_pin is distinct from old.kra_pin then
      raise exception 'KRA PIN cannot be changed once set; contact Garbage Mania';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_customer_self_update on public.customers;
create trigger guard_customer_self_update
  before update on public.customers
  for each row execute function public.guard_customer_self_update();

-- 2. Customers can currently SELECT their own DRAFT invoices (not yet issued).
--    get_customer_statement() is SECURITY INVOKER, so once drafts are hidden
--    by RLS its outstanding_balance_cents also stops counting them.
drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own
on public.invoices
for select
to authenticated
using (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
  and status <> 'draft'
);

-- 3. waste_collection_requests_insert_own only checks customer_id, so a
--    customer could attach a request to ANOTHER customer's service_address_id
--    (the FK is satisfied). Require that the address is theirs.
drop policy if exists waste_collection_requests_insert_own on public.waste_collection_requests;
create policy waste_collection_requests_insert_own
on public.waste_collection_requests
for insert
to authenticated
with check (
  public.user_role() = 'customer'
  and customer_id = public.customer_id()
  and public.owns_service_address(service_address_id)
);
