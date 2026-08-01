-- Local development seed. Runs automatically on `npx supabase db reset`
-- (declared by [db.seed] sql_paths in supabase/config.toml).
--
-- Creates the MVP administrator account so a fresh local stack is usable with no
-- manual step. This applies to the LOCAL database only: nothing in this repository
-- creates users in the production Supabase project. Production accounts are made by
-- hand in the dashboard (Authentication -> Users -> Add user, "Auto Confirm User"),
-- because a code path capable of minting administrators against production has no
-- product justification.
--
-- Credentials match the notice on /auth/signin: test@test.com / Test123!
--
-- Two things here are load-bearing:
--   * The matching auth.identities row. GoTrue resolves email logins through that
--     table, so a lone auth.users row yields an account that is visible in the
--     dashboard and still cannot sign in.
--   * Idempotency. [db.seed] also runs on `npx supabase seed`, not only after a
--     wipe, so both inserts must no-op when the account already exists.
--
-- auth.users is Supabase-owned and its columns have shifted across GoTrue versions;
-- this file encodes an assumption about that schema. Verify it by signing in, not by
-- selecting the row.

-- pgcrypto (crypt/gen_salt) lives in the extensions schema on Supabase.
set search_path = public, extensions;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  -- GoTrue scans these into non-nullable Go strings; NULL breaks sign-in.
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'test@test.com',
  crypt('Test123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  '',
  ''
where not exists (
  select 1 from auth.users where email = 'test@test.com'
);

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email = 'test@test.com'
  and not exists (
    select 1
    from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );
