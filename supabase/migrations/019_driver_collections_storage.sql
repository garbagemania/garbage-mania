-- 019_driver_collections_storage.sql
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` before relying on it.
--
-- Gaps found in the audit (all previously unusable for drivers):
--   1. Drivers had no way to change a collection's status: collections has no
--      driver UPDATE policy and transition_collection_status() is SECURITY
--      INVOKER. Added driver_record_collection(), a SECURITY DEFINER function
--      that only acts on the calling driver's own assigned collections and
--      enforces the proof-of-collection rule (photo required to complete,
--      reason required to fail). The existing enforce_status_transition
--      trigger still decides which transitions are legal.
--   2. Drivers could not read service_addresses/properties, so they could not
--      see where a stop is. Added read policies limited to addresses of
--      collections assigned to them.
--   3. documents_select_staff let every driver read EVERY document row
--      (cheque images, customer documents). Drivers now only see documents
--      they uploaded or that are evidence on their own collections.
--   4. No storage buckets or storage policies existed. Added two PRIVATE
--      buckets: collection-evidence and cheque-images.

-- ---------------------------------------------------------------------
-- 2. Driver read access to the addresses they are sent to
-- ---------------------------------------------------------------------

create or replace function public.driver_assigned_to_service_address(p_service_address_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.collections c
    where c.service_address_id = p_service_address_id
      and public.is_assigned_driver(c.daily_assignment_id)
  );
$$;

create or replace function public.driver_assigned_to_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.service_addresses sa
    where sa.property_id = p_property_id
      and public.driver_assigned_to_service_address(sa.id)
  );
$$;

revoke all on function public.driver_assigned_to_service_address(uuid) from public, anon;
revoke all on function public.driver_assigned_to_property(uuid) from public, anon;
grant execute on function public.driver_assigned_to_service_address(uuid) to authenticated;
grant execute on function public.driver_assigned_to_property(uuid) to authenticated;

create policy service_addresses_select_driver_assigned
on public.service_addresses
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.driver_assigned_to_service_address(id)
);

create policy properties_select_driver_assigned
on public.properties
for select
to authenticated
using (
  public.user_role() = 'driver'
  and public.driver_assigned_to_property(id)
);

-- ---------------------------------------------------------------------
-- 3. Narrow document visibility for drivers
-- ---------------------------------------------------------------------

drop policy if exists documents_select_staff on public.documents;

create policy documents_select_staff
on public.documents
for select
to authenticated
using (
  public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager')
);

create policy documents_select_driver_own_evidence
on public.documents
for select
to authenticated
using (
  public.user_role() = 'driver'
  and (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.collection_evidence ce
      where ce.document_id = documents.id
        and public.is_assigned_driver_for_collection(ce.collection_id)
    )
  )
);

-- ---------------------------------------------------------------------
-- 1. Driver collection actions
-- ---------------------------------------------------------------------
-- p_action: 'arrive' | 'complete' | 'fail'
--   arrive   assigned -> in_progress, stamps arrived_at (idempotent)
--   complete requires a proof photo (p_document_id, uploaded by the caller
--            under <collection_id>/ in the collection-evidence bucket);
--            records collection_evidence, then in_progress -> completed
--   fail     requires p_reason; records failed_collections
-- Rescheduling stays with operations (failed -> rescheduled).

create or replace function public.driver_record_collection(
  p_collection_id uuid,
  p_action        text,
  p_reason        public.collection_status_reason default null,
  p_notes         text default null,
  p_document_id   uuid default null,
  p_latitude      double precision default null,
  p_longitude     double precision default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.collection_status;
  v_notes  text := nullif(left(trim(coalesce(p_notes, '')), 1000), '');
begin
  if public.user_role() is distinct from 'driver' then
    raise exception 'Only drivers can record collections' using errcode = '42501';
  end if;

  if not public.is_assigned_driver_for_collection(p_collection_id) then
    raise exception 'This collection is not assigned to you' using errcode = '42501';
  end if;

  if p_latitude is not null and (p_latitude not between -90 and 90) then
    raise exception 'Invalid latitude';
  end if;
  if p_longitude is not null and (p_longitude not between -180 and 180) then
    raise exception 'Invalid longitude';
  end if;

  select status into v_status
  from public.collections
  where id = p_collection_id
  for update;

  if p_action = 'arrive' then
    if v_status = 'assigned' then
      perform public.transition_collection_status(p_collection_id, 'in_progress', null, auth.uid());
    elsif v_status <> 'in_progress' then
      raise exception 'Cannot mark arrival: collection is %', v_status;
    end if;
    update public.collections
    set arrived_at = coalesce(arrived_at, now())
    where id = p_collection_id;

  elsif p_action = 'complete' then
    if v_status not in ('assigned', 'in_progress') then
      raise exception 'Cannot complete: collection is %', v_status;
    end if;

    -- Proof of collection is mandatory.
    if p_document_id is null then
      raise exception 'A proof photo is required to complete a collection';
    end if;
    if not exists (
      select 1 from public.documents d
      where d.id = p_document_id
        and d.uploaded_by = auth.uid()
        and d.storage_path like p_collection_id::text || '/%'
    ) then
      raise exception 'Proof photo does not belong to this collection';
    end if;

    if v_status = 'assigned' then
      perform public.transition_collection_status(p_collection_id, 'in_progress', null, auth.uid());
    end if;

    insert into public.collection_evidence (collection_id, document_id, latitude, longitude, captured_at)
    values (p_collection_id, p_document_id, p_latitude, p_longitude, now());

    perform public.transition_collection_status(p_collection_id, 'completed', null, auth.uid());

    update public.collections
    set arrived_at   = coalesce(arrived_at, now()),
        completed_at = now()
    where id = p_collection_id;

  elsif p_action = 'fail' then
    if p_reason is null then
      raise exception 'A reason is required when a collection fails';
    end if;
    if v_status not in ('assigned', 'in_progress') then
      raise exception 'Cannot fail: collection is %', v_status;
    end if;

    perform public.transition_collection_status(p_collection_id, 'failed', p_reason, auth.uid());

    insert into public.failed_collections (collection_id, reason_code, notes)
    values (p_collection_id, p_reason, v_notes);

  else
    raise exception 'Unknown action %', p_action;
  end if;
end;
$$;

revoke all on function public.driver_record_collection(uuid, text, public.collection_status_reason, text, uuid, double precision, double precision) from public, anon;
grant execute on function public.driver_record_collection(uuid, text, public.collection_status_reason, text, uuid, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Private storage buckets + policies
-- ---------------------------------------------------------------------
-- Path conventions (enforced by the policies below):
--   collection-evidence/<collection_id>/<file>
--   cheque-images/<anything>/<file>          (staff finance roles only)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('collection-evidence', 'collection-evidence', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('cheque-images', 'cheque-images', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a collection id; null when it is not a UUID.
create or replace function public.storage_path_collection_id(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.storage_path_collection_id(text) to authenticated;

create policy collection_evidence_objects_insert_driver
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'collection-evidence'
  and public.user_role() = 'driver'
  and public.storage_path_collection_id(name) is not null
  and public.is_assigned_driver_for_collection(public.storage_path_collection_id(name))
);

create policy collection_evidence_objects_insert_ops
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'collection-evidence'
  and public.user_role() in ('super_admin', 'operations_manager')
  and public.storage_path_collection_id(name) is not null
);

create policy collection_evidence_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'collection-evidence'
  and public.storage_path_collection_id(name) is not null
  and (
    public.user_role() in ('super_admin', 'admin', 'finance', 'operations_manager')
    or (public.user_role() = 'driver'
        and public.is_assigned_driver_for_collection(public.storage_path_collection_id(name)))
    or (public.user_role() = 'customer'
        and public.owns_collection(public.storage_path_collection_id(name)))
  )
);

-- No UPDATE/DELETE policies: evidence is immutable from the app.

create policy cheque_images_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cheque-images'
  and public.user_role() in ('super_admin', 'admin', 'finance')
);

create policy cheque_images_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'cheque-images'
  and public.user_role() in ('super_admin', 'admin', 'finance')
);
