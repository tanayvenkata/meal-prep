#!/usr/bin/env node
/**
 * Set (or rotate) the mise_app login password without putting secrets in git.
 *
 * Usage:
 *   ADMIN_DATABASE_URL=postgresql://postgres:... \
 *   MISE_APP_DB_PASSWORD='...' \
 *   node scripts/provision-mise-app-role.mjs
 *
 * Local stack: seed.sql also sets a well-known local-only password so
 * `supabase start` / `db reset` work without this script. Production and
 * staging should always use this script (or the SQL editor) with a secret
 * password, then point Doppler DATABASE_URL at mise_app.
 */

import postgres from "postgres";

const adminUrl = process.env.ADMIN_DATABASE_URL;
const password = process.env.MISE_APP_DB_PASSWORD;

if (!adminUrl) {
  console.error("ADMIN_DATABASE_URL is required.");
  process.exit(1);
}
if (!password) {
  console.error("MISE_APP_DB_PASSWORD is required.");
  process.exit(1);
}
if (password.length < 12 && process.env.ALLOW_SHORT_MISE_APP_PASSWORD !== "1") {
  console.error(
    "MISE_APP_DB_PASSWORD must be at least 12 characters (set ALLOW_SHORT_MISE_APP_PASSWORD=1 for local-only).",
  );
  process.exit(1);
}

const sql = postgres(adminUrl, { max: 1 });

try {
  const [safety] = await sql`
    select
      r.rolname,
      r.rolcanlogin,
      r.rolsuper,
      r.rolinherit,
      r.rolcreatedb,
      r.rolcreaterole,
      r.rolreplication,
      r.rolbypassrls,
      pg_has_role(r.oid, 'authenticated', 'MEMBER') as can_set_authenticated,
      exists (
        select 1
        from pg_auth_members membership
        join pg_roles parent_role on parent_role.oid = membership.roleid
        where membership.member = r.oid
          and parent_role.rolname <> 'authenticated'
      ) as has_unexpected_memberships,
      exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and c.relowner = r.oid
      ) as owns_public_tables
    from pg_roles r
    where r.rolname = 'mise_app'
  `;
  if (!safety) {
    console.error("Role mise_app does not exist. Apply migrations first.");
    process.exit(1);
  }
  if (
    !safety.rolcanlogin ||
    safety.rolsuper ||
    safety.rolinherit ||
    safety.rolcreatedb ||
    safety.rolcreaterole ||
    safety.rolreplication ||
    safety.rolbypassrls ||
    !safety.can_set_authenticated ||
    safety.has_unexpected_memberships ||
    safety.owns_public_tables
  ) {
    console.error("Role mise_app is not fail-closed; refusing to update its password.");
    console.error(JSON.stringify(safety, null, 2));
    process.exit(1);
  }

  // Parameterized password: bind into quote_literal, then EXECUTE the ALTER.
  // Never concatenate the raw password into SQL text.
  await sql.begin(async (tx) => {
    await tx`select set_config('mise.provision_password', ${password}, true)`;
    await tx`
      do $do$
      begin
        execute format(
          'alter role mise_app with login password %L',
          current_setting('mise.provision_password')
        );
      end
      $do$
    `;
  });

  console.log("mise_app password updated.");
  console.log(
    JSON.stringify(
      {
        rolname: safety.rolname,
        rolsuper: safety.rolsuper,
        rolinherit: safety.rolinherit,
        rolcreatedb: safety.rolcreatedb,
        rolcreaterole: safety.rolcreaterole,
        rolreplication: safety.rolreplication,
        rolbypassrls: safety.rolbypassrls,
        rolcanlogin: safety.rolcanlogin,
        can_set_authenticated: safety.can_set_authenticated,
        has_unexpected_memberships: safety.has_unexpected_memberships,
        owns_public_tables: safety.owns_public_tables,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
