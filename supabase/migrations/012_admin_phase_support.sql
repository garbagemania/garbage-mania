-- 012_admin_phase_support.sql
--
-- Two small, narrowly-scoped additions surfaced by actually building the
-- admin control center (this phase) — not a schema redesign, no table
-- changes, no new business columns. Each is a genuine implementation
-- problem this phase hit, not a stylistic preference:
--
-- 1. Realtime on `collections`. The admin collections screen (Phase 3,
--    "REAL-TIME") needs Supabase Realtime postgres_changes events for
--    collection status updates - Supabase only streams changes for
--    tables explicitly added to the `supabase_realtime` publication, and
--    no earlier migration did that for any table.
--
-- 2. An atomic price-rotation function for service_plan_prices. Adding a
--    new price requires two writes - close the current row
--    (effective_to = new date - 1) and insert the new one - and the
--    schema's own partial unique index (service_plan_prices_one_current_
--    per_plan, 003_commercial.sql) means a UI that issued those as two
--    separate supabase-js calls would have a real failure window: if the
--    second write failed, the plan would be left with zero current
--    prices. This was flagged as a known risk in
--    MIGRATION_PLAN.md §7.11 ("needs to run inside one transaction... or
--    a small stored procedure") before any UI existed to hit it - this
--    is that stored procedure, following the exact same
--    SECURITY INVOKER, RLS-bound pattern as the transition_*_status()
--    functions already in the schema (003/005/006/007), not a new
--    pattern.

-- 1. Realtime -------------------------------------------------------------

alter publication supabase_realtime add table public.collections;

-- 2. Atomic service-plan price rotation -----------------------------------

create function public.set_service_plan_price(
  p_service_plan_id uuid,
  p_price_cents bigint,
  p_effective_from date
)
returns public.service_plan_prices
language plpgsql
as $$
declare
  v_new_row public.service_plan_prices;
begin
  if p_price_cents < 0 then
    raise exception 'price_cents must not be negative';
  end if;

  update public.service_plan_prices
  set effective_to = p_effective_from - 1
  where service_plan_id = p_service_plan_id
    and effective_to is null
    and effective_from < p_effective_from;

  insert into public.service_plan_prices (service_plan_id, price_cents, effective_from)
  values (p_service_plan_id, p_price_cents, p_effective_from)
  returning * into v_new_row;

  return v_new_row;
end;
$$;

comment on function public.set_service_plan_price(uuid, bigint, date) is
  'Atomically closes the current price (if any) and opens a new one for a '
  'service plan, in one call - the two writes this needs would otherwise '
  'leave a window where a failed second call left the plan with zero '
  'current prices. SECURITY INVOKER (the default - no elevation): runs '
  'under the caller''s own RLS, so only roles already allowed to write '
  'service_plan_prices (011_rls_policies.sql: '
  'service_plan_prices_insert - super_admin/admin/finance) can use it, '
  'same as before this function existed.';
