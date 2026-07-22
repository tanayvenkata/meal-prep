-- Fail-closed application login role (issue #64).
--
-- Context: withUserContext already SET ROLE authenticated so RLS policies apply,
-- but the pool still connected as table-owner postgres (BYPASSRLS). An unwrapped
-- query on that connection silently skipped every policy. Structural fix: connect
-- as a non-owner role that cannot bypass RLS and has no direct table privileges.
--
-- Password is NOT set here (credentials stay out of migrations / git). Local seed
-- and scripts/provision-mise-app-role.mjs set passwords per environment. Production
-- uses a Doppler-managed password and points DATABASE_URL at this role.
--
-- Note: on Supabase, the migration role can CREATE ROLE with the right attributes
-- but cannot always ALTER ROLE afterward (not a superuser). Create-if-missing is
-- the durable path; attributes are fixed at create time.

do $$
declare
  existing_role record;
begin
  select
    rolcanlogin,
    rolsuper,
    rolinherit,
    rolcreatedb,
    rolcreaterole,
    rolreplication,
    rolbypassrls
  into existing_role
  from pg_roles
  where rolname = 'mise_app';

  if not found then
    create role mise_app
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      noinherit
      nobypassrls
      login;
  elsif not existing_role.rolcanlogin
    or existing_role.rolsuper
    or existing_role.rolinherit
    or existing_role.rolcreatedb
    or existing_role.rolcreaterole
    or existing_role.rolreplication
    or existing_role.rolbypassrls
  then
    raise exception 'Existing mise_app role has unsafe attributes; refuse to continue';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = c.relowner
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and r.rolname = 'mise_app'
  ) then
    raise exception 'Existing mise_app role owns public tables; refuse to continue';
  end if;
end $$;

-- Match PostgREST's authenticator pattern: login role may SET ROLE authenticated
-- but does not inherit those privileges outside the SET ROLE boundary.
grant authenticated to mise_app;

do $$
begin
  if exists (
    select 1
    from pg_auth_members membership
    join pg_roles parent_role on parent_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'mise_app'
      and parent_role.rolname <> 'authenticated'
  ) then
    raise exception 'Existing mise_app role has unexpected role memberships; refuse to continue';
  end if;
end $$;

grant connect on database postgres to mise_app;
grant usage on schema public to mise_app;

-- Explicitly no table/sequence DML for mise_app. After SET ROLE authenticated the
-- session uses authenticated's existing grants. Without withUserContext, queries
-- fail closed (permission denied) rather than bypassing RLS as the table owner.
revoke all on all tables in schema public from mise_app;
revoke all on all sequences in schema public from mise_app;

-- Future tables created by postgres in public should not silently grant mise_app.
alter default privileges for role postgres in schema public
  revoke all on tables from mise_app;
alter default privileges for role postgres in schema public
  revoke all on sequences from mise_app;
