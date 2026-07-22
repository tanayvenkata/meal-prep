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
begin
  if not exists (select 1 from pg_roles where rolname = 'mise_app') then
    create role mise_app
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      noinherit
      nobypassrls
      login;
  end if;
end $$;

-- Match PostgREST's authenticator pattern: login role may SET ROLE authenticated
-- but does not inherit those privileges outside the SET ROLE boundary.
grant authenticated to mise_app;

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
