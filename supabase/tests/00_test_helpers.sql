-- supabase/tests/00_test_helpers.sql
--
-- Test-only helper used by the RLS tests: tests.authenticate_as(user_id).
-- Lives here (NOT in supabase/migrations/) so it is never deployed to a real
-- project. It is deliberately not wrapped in a transaction so it persists for
-- the other test files in this run; `supabase db reset` removes it.
--
-- It does not bypass RLS: it switches to the `authenticated` role and sets the
-- JWT claims that auth.uid() reads, exactly as PostgREST does.

create schema if not exists tests;

create or replace function tests.authenticate_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
end;
$$;

-- Tests call authenticate_as() again after already switching role.
grant usage on schema tests to authenticated, anon;
grant execute on function tests.authenticate_as(uuid) to authenticated, anon;

begin;
select plan(1);
select has_function('tests', 'authenticate_as', array['uuid'], 'tests.authenticate_as(uuid) helper is installed');
select * from finish();
rollback;
