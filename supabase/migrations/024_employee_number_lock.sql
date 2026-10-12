-- 024_employee_number_lock.sql
--
-- next_employee_number() was "highest + 1" with no locking, so two admins adding
-- staff in the same instant could both be handed the same number (the unique
-- constraint then rejects the second). This serialises number allocation with a
-- transaction-scoped advisory lock: the lock is held until the calling
-- transaction (provision_staff, which also inserts the row) commits, so the next
-- caller always sees the previous number. The unique constraint stays as the
-- final backstop. Behaviour is otherwise unchanged: non-matching numbers such as
-- GM-FIN-001 are still ignored.
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` to confirm.

create or replace function public.next_employee_number()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext('staff_profiles.employee_number'));

  select coalesce(max((substring(employee_number from '^GM-([0-9]+)$'))::int), 0) + 1
    into v_next
    from public.staff_profiles;

  return 'GM-' || lpad(v_next::text, 4, '0');
end;
$$;
