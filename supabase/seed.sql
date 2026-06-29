-- Local-dev seed. Runs automatically on `supabase db reset` (see [db.seed] in config.toml).
-- Purpose: a fresh LOCAL Supabase comes up usable — a test user you can log in as, plus a
-- few pantry items — so `npm run dev` against local isn't an empty, confusing shell.
--
-- This NEVER runs against prod (it's a local-only file loaded by the local stack).
-- Login creds:  test@local.dev  /  password123
--
-- Why this is more than a simple INSERT: a Supabase auth user lives in auth.users with a
-- hashed password and required bookkeeping columns, and needs a matching auth.identities row
-- for email/password login to work. We hash the password with pgcrypto's crypt()+bf salt.

-- Fixed UUID so the user_id in items below can reference it deterministically.
-- (Any valid uuid works; this one is arbitrary but stable.)
do $$
declare
  uid uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Create the auth user if it doesn't already exist.
  if not exists (select 1 from auth.users where id = uid) then
    -- The token columns below must be '' (empty string), not NULL: Supabase's auth
    -- service (gotrue) scans them into Go strings on login and errors on NULL
    -- ("converting NULL to string is unsupported" → 500). Some have a '' default and
    -- some don't, so we set all of them explicitly — not relying on column defaults
    -- that can change across Supabase versions.
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      'test@local.dev',
      crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}',
      '', '', '', '', '', '', '', ''
    );

    -- Matching identity row — required for email/password sign-in to resolve.
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid, uid::text,
      format('{"sub":"%s","email":"%s"}', uid::text, 'test@local.dev')::jsonb,
      'email', now(), now(), now()
    );
  end if;

  -- Sample pantry for that user (idempotent: only seed if they have none).
  if not exists (select 1 from public.items where user_id = uid) then
    insert into public.items (user_id, name, quantity) values
      (uid, 'chicken thighs', '2 lbs'),
      (uid, 'paprika',        null),
      (uid, 'olive oil',      '1 bottle'),
      (uid, 'rice',           '5 lbs');
  end if;
end $$;
