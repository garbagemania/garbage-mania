-- 022_admin_delete_and_staff_management.sql
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` before relying on it.
--
-- 1. Deleting records is an admin-only power. Finance can still record,
--    verify, allocate, issue and CANCEL (a reversal that keeps the audit
--    trail), but can no longer discard (hard-delete) a draft invoice.
-- 2. Closes a privilege-escalation gap: profiles_update_self (011) let any
--    signed-in user UPDATE their own profiles row, including role_id, kind
--    and status. Only a super admin may change those, and never on their
--    own row.
-- 3. Staff management functions (create / change role / suspend), so the
--    rules (super admin only, no self-change, never remove the last active
--    super admin) live in the database and not only in the app.

-- ---------------------------------------------------------------------
-- 1. Admin-only delete
-- ---------------------------------------------------------------------
create or replace function public.require_finance_deleter()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.user_role(), '') not in ('super_admin', 'admin') then
    raise exception 'Only an administrator can delete records' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.discard_draft_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.invoice_status;
begin
  perform public.require_finance_deleter();
  select status into v_status from public.invoices where id = p_invoice_id for update;
  if v_status is null then raise exception 'Invoice not found'; end if;
  if v_status <> 'draft' then
    raise exception 'Only draft invoices can be discarded; cancel or credit an issued invoice' using errcode = '42501';
  end if;
  delete from public.invoice_items where invoice_id = p_invoice_id;
  delete from public.invoices where id = p_invoice_id;
end;
$$;

revoke all on function public.require_finance_deleter() from public, anon;
grant execute on function public.require_finance_deleter() to authenticated;
revoke all on function public.discard_draft_invoice(uuid) from public, anon;
grant execute on function public.discard_draft_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Guard privileged profile columns
-- ---------------------------------------------------------------------
-- auth.uid() is null for the service role, the SQL editor and migrations,
-- so scripts (bootstrap-admin, create-finance-user, set-admin-password)
-- keep working. Any real signed-in session is checked.
create or replace function public.guard_profile_privileged_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role_id is distinct from old.role_id
     or new.kind is distinct from old.kind
     or new.status is distinct from old.status then
    if coalesce(public.user_role(), '') <> 'super_admin' then
      raise exception 'Only a super admin can change a role, account type or status' using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role or status' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_update on public.profiles;
create trigger guard_profile_privileged_update
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_update();

-- ---------------------------------------------------------------------
-- 3. Staff management
-- ---------------------------------------------------------------------
create or replace function public.require_super_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(public.user_role(), '') <> 'super_admin' then
    raise exception 'Only a super admin can manage staff' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Next free "GM-0001" style number. Numbers that do not match the pattern
-- (e.g. GM-FIN-001) are ignored.
create or replace function public.next_employee_number()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'GM-' || lpad(
    (coalesce(max((substring(employee_number from '^GM-([0-9]+)$'))::int), 0) + 1)::text, 4, '0')
  from public.staff_profiles;
$$;

-- Called by the app AFTER it has created the auth user (service role).
-- Creates profile + staff_profile (+ drivers row) in one transaction.
create or replace function public.provision_staff(
  p_user_id         uuid,
  p_full_name       text,
  p_phone           text,
  p_role            text,
  p_employee_number text,
  p_department      text,
  p_license_number  text,
  p_license_expiry  date
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_id uuid;
  v_emp     text;
begin
  perform public.require_super_admin();

  if p_role not in ('super_admin', 'admin', 'finance', 'operations_manager', 'driver') then
    raise exception 'Invalid staff role %', p_role;
  end if;
  if nullif(trim(coalesce(p_full_name, '')), '') is null then
    raise exception 'Full name is required';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Login not found';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'This login already has a profile';
  end if;
  if p_role = 'driver'
     and (nullif(trim(coalesce(p_license_number, '')), '') is null or p_license_expiry is null) then
    raise exception 'A driver needs a licence number and licence expiry date';
  end if;

  select id into v_role_id from public.roles where code = p_role;
  v_emp := coalesce(nullif(trim(coalesce(p_employee_number, '')), ''), public.next_employee_number());

  insert into public.profiles (id, role_id, kind, full_name, phone)
  values (p_user_id, v_role_id, 'staff', trim(p_full_name), nullif(trim(coalesce(p_phone, '')), ''));

  insert into public.staff_profiles (id, employee_number, department)
  values (p_user_id, v_emp, nullif(trim(coalesce(p_department, '')), ''));

  if p_role = 'driver' then
    insert into public.drivers (id, license_number, license_expiry)
    values (p_user_id, trim(p_license_number), p_license_expiry);
  end if;

  return v_emp;
end;
$$;

create or replace function public.set_staff_role(
  p_user_id        uuid,
  p_role           text,
  p_license_number text,
  p_license_expiry date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := public.require_super_admin();
  v_old_role text;
  v_status   public.profile_status;
  v_kind     public.profile_kind;
  v_role_id  uuid;
begin
  if p_role not in ('super_admin', 'admin', 'finance', 'operations_manager', 'driver') then
    raise exception 'Invalid staff role %', p_role;
  end if;
  if p_user_id = v_uid then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  select r.code, p.status, p.kind
    into v_old_role, v_status, v_kind
  from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = p_user_id
  for update of p;
  if v_old_role is null then raise exception 'Staff member not found'; end if;
  if v_kind <> 'staff' then raise exception 'That account is not a staff account'; end if;
  if v_old_role = p_role then return; end if;

  if v_old_role = 'super_admin' and v_status = 'active'
     and (select count(*) from public.profiles p join public.roles r on r.id = p.role_id
          where r.code = 'super_admin' and p.status = 'active') <= 1 then
    raise exception 'There must always be at least one active super admin';
  end if;

  if p_role = 'driver' and not exists (select 1 from public.drivers where id = p_user_id)
     and (nullif(trim(coalesce(p_license_number, '')), '') is null or p_license_expiry is null) then
    raise exception 'A driver needs a licence number and licence expiry date';
  end if;

  select id into v_role_id from public.roles where code = p_role;
  update public.profiles set role_id = v_role_id where id = p_user_id;

  if p_role = 'driver' then
    if exists (select 1 from public.drivers where id = p_user_id) then
      update public.drivers set status = 'active' where id = p_user_id;
    else
      insert into public.drivers (id, license_number, license_expiry)
      values (p_user_id, trim(p_license_number), p_license_expiry);
    end if;
  elsif v_old_role = 'driver' then
    -- Keep the row (collections history references it); just deactivate it.
    update public.drivers set status = 'inactive' where id = p_user_id;
  end if;
end;
$$;

create or replace function public.set_staff_status(p_user_id uuid, p_suspend boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := public.require_super_admin();
  v_role     text;
  v_status   public.profile_status;
  v_kind     public.profile_kind;
begin
  if p_user_id = v_uid then
    raise exception 'You cannot suspend your own account' using errcode = '42501';
  end if;

  select r.code, p.status, p.kind
    into v_role, v_status, v_kind
  from public.profiles p join public.roles r on r.id = p.role_id
  where p.id = p_user_id
  for update of p;
  if v_role is null then raise exception 'Staff member not found'; end if;
  if v_kind <> 'staff' then raise exception 'That account is not a staff account'; end if;

  if p_suspend then
    if v_role = 'super_admin' and v_status = 'active'
       and (select count(*) from public.profiles p join public.roles r on r.id = p.role_id
            where r.code = 'super_admin' and p.status = 'active') <= 1 then
      raise exception 'There must always be at least one active super admin';
    end if;
    update public.profiles set status = 'suspended' where id = p_user_id;
    update public.staff_profiles set is_active = false where id = p_user_id;
    update public.drivers set status = 'suspended' where id = p_user_id and status = 'active';
  else
    update public.profiles set status = 'active' where id = p_user_id;
    update public.staff_profiles set is_active = true where id = p_user_id;
    update public.drivers set status = 'active' where id = p_user_id and status = 'suspended';
  end if;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.require_super_admin()',
    'public.next_employee_number()',
    'public.provision_staff(uuid, text, text, text, text, text, text, date)',
    'public.set_staff_role(uuid, text, text, date)',
    'public.set_staff_status(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
