-- Migration: create public.buildings
-- Purpose:   The first table in EstateManager, and with it the access contract every
--            later table inherits. Roadmap S-01, PRD FR-011.
-- Affects:   public.buildings (new), its row level security policies (new).
--
-- Why this table is the one that sets the pattern: it is the smallest carrier the
-- product will ever have -- three content columns, no owner data, nothing that makes a
-- policy mistake expensive. Getting row level security right here is cheaper than
-- retrofitting it onto a populated registry in S-01b.
--
-- Forward-only. `supabase db push` has no rollback and `wrangler rollback` reverts code,
-- never schema, so the whole file runs in one transaction: it either applies or it does
-- not, and never lands half-way.

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.buildings (
  id uuid primary key default gen_random_uuid(),

  -- Community name, e.g. 'Wspolnota Mieszkaniowa Kwiatowa 3'.
  name text not null,

  -- Address, deliberately two columns rather than one free-text field. A single
  -- 'address' string is neither searchable nor comparable: 'ul. Kwiatowa 3, Warszawa'
  -- and 'Warszawa, Kwiatowa 3' are the same building and two different strings, which
  -- the unique constraint below would not catch.
  city text not null,

  -- Street AND number in one field on purpose. Polish addresses write the number
  -- inline ('Kwiatowa 3/5', 'al. Jana Pawla II 12A', 'Rynek 15 m. 4'); a separate
  -- number column would only start an argument about its format.
  street text not null,

  created_at timestamptz not null default now(),

  -- Trimmed-non-empty rather than plain not null: '   ' passes not null and is not an
  -- address. The API route trims before insert; this is the backstop for anything that
  -- reaches the table by another path.
  constraint buildings_name_not_blank check (length(trim(name)) > 0),
  constraint buildings_city_not_blank check (length(trim(city)) > 0),
  constraint buildings_street_not_blank check (length(trim(street)) > 0),

  -- Catches an accidental double submit without forbidding two genuinely different
  -- buildings that share a name in different towns.
  constraint buildings_name_city_street_key unique (name, city, street)
);

comment on table public.buildings is
  'Housing communities (wspolnoty mieszkaniowe) managed in EstateManager. Extensible by
   design (PRD FR-011): a further descriptive column is an additive migration plus one
   form field, never a reshape of this table or of the write path.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.buildings enable row level security;

-- Eight policies: one per operation, per role. `anon` is written out explicitly rather
-- than left to implicit deny, because in this product the unauthenticated path is real
-- -- owners vote from an emailed per-unit link with no session -- so every table has to
-- make a deliberate statement about it instead of inheriting silence.
--
-- The `authenticated` predicates are unconditional because PRD v1 has no roles model:
-- every user in the database is an administrator. When S-01b introduces building_id
-- scoping, that is where predicates stop being `true`.

-- authenticated: full CRUD.

create policy "buildings_select_authenticated"
  on public.buildings
  for select
  to authenticated
  using (true);

create policy "buildings_insert_authenticated"
  on public.buildings
  for insert
  to authenticated
  with check (true);

-- update needs BOTH using and with check. `using` gates which rows may be touched;
-- `with check` gates what they may become. Omitting the latter is the RLS bug most
-- likely to propagate into later tables once predicates are no longer `true`.
create policy "buildings_update_authenticated"
  on public.buildings
  for update
  to authenticated
  using (true)
  with check (true);

create policy "buildings_delete_authenticated"
  on public.buildings
  for delete
  to authenticated
  using (true);

-- anon: denied on every operation. Owners never read or write the building registry;
-- their only unauthenticated surface is the per-unit voting link built in S-02.

create policy "buildings_select_anon"
  on public.buildings
  for select
  to anon
  using (false);

create policy "buildings_insert_anon"
  on public.buildings
  for insert
  to anon
  with check (false);

create policy "buildings_update_anon"
  on public.buildings
  for update
  to anon
  using (false)
  with check (false);

create policy "buildings_delete_anon"
  on public.buildings
  for delete
  to anon
  using (false);

commit;
