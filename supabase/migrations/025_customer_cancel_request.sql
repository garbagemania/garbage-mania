-- 025_customer_cancel_request.sql
--
-- Lets a customer withdraw their OWN collection request while it is still
-- waiting for review. Customers have no UPDATE policy on
-- waste_collection_requests (by design: they must not edit or re-open
-- requests), so the single allowed change goes through this narrow
-- SECURITY DEFINER function: it checks ownership and that the status is
-- still 'submitted', and touches nothing else. The existing audit trigger
-- records the change.
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` before relying on it.

create or replace function public.cancel_own_collection_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer uuid := public.customer_id();
  v_status   public.request_status;
begin
  if coalesce(public.user_role(), '') <> 'customer' or v_customer is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select status into v_status
    from public.waste_collection_requests
   where id = p_request_id and customer_id = v_customer
   for update;
  if not found then raise exception 'Request not found'; end if;
  if v_status <> 'submitted' then
    raise exception 'This request has already been %, so it can no longer be cancelled', v_status;
  end if;

  update public.waste_collection_requests set status = 'cancelled' where id = p_request_id;
end;
$$;

revoke all on function public.cancel_own_collection_request(uuid) from public, anon;
grant execute on function public.cancel_own_collection_request(uuid) to authenticated;
