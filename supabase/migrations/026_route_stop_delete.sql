-- 026_route_stop_delete.sql
--
-- 011 gave route_stops select/insert/update policies but no DELETE policy, so
-- a stop added by mistake (or an address that left the route) could never be
-- removed. Same roles that may insert and update stops may now delete them.
-- Nothing else is touched: collections already generated from a run keep their
-- own rows, and the existing audit trigger on route_stops records the delete.
--
-- NOT yet executed against a database - run `supabase db reset` and
-- `supabase test db` to confirm.

create policy route_stops_delete
on public.route_stops
for delete
to authenticated
using (
  public.user_role() in ('super_admin', 'operations_manager')
);
