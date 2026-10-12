-- 023_collection_request_review.sql
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` before relying on it.
--
-- Customers could submit a collection request from the portal, but nothing
-- on the admin side read or acted on it, and no role could INSERT into
-- collections (011 only defines select/update policies there). This adds the
-- review step: approving a request creates the one-off collection and links
-- it back; rejecting records why. Done in a SECURITY DEFINER function so the
-- rules live in the database and `collections` stays closed to direct inserts.

alter table public.waste_collection_requests
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

create or replace function public.review_collection_request(
  p_request_id     uuid,
  p_approve        boolean,
  p_scheduled_date date,
  p_note           text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_req        record;
  v_addr_status text;
  v_today      date := (now() at time zone 'Africa/Nairobi')::date;
  v_collection uuid;
begin
  if coalesce(public.user_role(), '') not in ('super_admin', 'admin', 'operations_manager') then
    raise exception 'Not allowed to review collection requests' using errcode = '42501';
  end if;

  select * into v_req from public.waste_collection_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status <> 'submitted' then
    raise exception 'This request has already been %', v_req.status;
  end if;

  if not p_approve then
    if nullif(trim(coalesce(p_note, '')), '') is null then
      raise exception 'Give the customer a reason for rejecting the request';
    end if;
    update public.waste_collection_requests
       set status = 'rejected', review_note = trim(p_note), reviewed_by = v_uid, reviewed_at = now()
     where id = p_request_id;
    return null;
  end if;

  if p_scheduled_date is null then raise exception 'Choose a collection date'; end if;
  if p_scheduled_date < v_today then raise exception 'The collection date cannot be in the past'; end if;

  select status::text into v_addr_status from public.service_addresses where id = v_req.service_address_id;
  if v_addr_status is distinct from 'active' then
    raise exception 'The service address is not active';
  end if;

  insert into public.collections (service_address_id, collection_request_id, scheduled_date, status)
  values (v_req.service_address_id, v_req.id, p_scheduled_date, 'scheduled')
  returning id into v_collection;

  update public.waste_collection_requests
     set status = 'scheduled',
         resulting_collection_id = v_collection,
         review_note = nullif(trim(coalesce(p_note, '')), ''),
         reviewed_by = v_uid,
         reviewed_at = now()
   where id = p_request_id;

  return v_collection;
end;
$$;

revoke all on function public.review_collection_request(uuid, boolean, date, text) from public, anon;
grant execute on function public.review_collection_request(uuid, boolean, date, text) to authenticated;
