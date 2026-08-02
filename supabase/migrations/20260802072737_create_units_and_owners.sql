-- Migration: create public.owners and public.units, plus the registry invariants
-- Purpose:   The unit registry every later slice stands on -- S-02 issues one voting link
--            per unit, S-03 weighs a vote by its unit's share, S-05 measures the 50%
--            threshold against the sum of all shares. Roadmap S-01b, PRD FR-001/FR-006.
-- Affects:   public.owners (new), public.units (new), public.buildings (one added column),
--            their row level security policies (new), two deferred constraint triggers
--            (new), public.import_building_units (new).
--
-- This is the first table in the project holding other people's personal data, which is
-- where the PRD guardrail "dane wlascicieli nie wychodza poza budynek" stops being a
-- sentence and becomes schema: the composite foreign key below makes a unit pointing at
-- an owner from another building unrepresentable, rather than merely discouraged.
--
-- Forward-only, like 20260801222109_create_buildings.sql. `supabase db push` has no
-- rollback and `wrangler rollback` reverts code, never schema, so the whole file runs in
-- one transaction: it either applies or it does not, and never lands half-way.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.owners (
  id uuid primary key default gen_random_uuid(),

  building_id uuid not null references public.buildings (id) on delete cascade,

  full_name text not null,

  -- Nullable on purpose. An owner with no address still holds a share, and the S-05
  -- threshold counts ALL shares -- dropping the unit would falsify the denominator.
  -- What they lose is the S-02 voting link, not their weight in the tally.
  email text,

  created_at timestamptz not null default now(),

  -- Trimmed-non-empty rather than plain not null: '   ' passes not null and is not a
  -- name. The importer trims before insert; this is the backstop for any other path.
  constraint owners_full_name_not_blank check (length(trim(full_name)) > 0),
  constraint owners_email_not_blank check (email is null or length(trim(email)) > 0),

  -- Not redundant with the primary key: this is the target of units' composite foreign
  -- key below, and Postgres requires a unique constraint on exactly those columns.
  constraint owners_id_building_id_key unique (id, building_id)
);

comment on table public.owners is
  'Unit owners within one building. One row per person, not per unit: an owner holding two
   units gets one row, so S-04 sends them one message rather than two. Identity is the
   e-mail address where there is one -- see owners_building_id_email_key.';

-- "Same address means the same person" enforced by the database rather than only by the
-- importer. Partial, because a null e-mail carries no identity: two owners with no
-- address are two people, not one.
create unique index owners_building_id_email_key
  on public.owners (building_id, lower(email))
  where email is not null;

create table public.units (
  id uuid primary key default gen_random_uuid(),

  building_id uuid not null references public.buildings (id) on delete cascade,

  owner_id uuid not null,

  unit_number text not null,

  area_m2 numeric(8,2) not null,

  -- Hundredths of a percent. The S-05 threshold rule compares sums, and integer
  -- arithmetic is the only representation of that comparison that cannot drift:
  -- `sum_for * 2 > 10000` is exact, `sum_for_percent * 2 > 100.0` is not. Every
  -- building's units total exactly 10000 -- asserted below, not merely intended.
  share_bps integer not null,

  created_at timestamptz not null default now(),

  constraint units_unit_number_not_blank check (length(trim(unit_number)) > 0),
  constraint units_area_positive check (area_m2 > 0),

  -- > 0 rather than >= 0: a unit at zero basis points can never affect a vote, which
  -- makes it a data error wearing the costume of a valid row. src/lib/shares.ts refuses
  -- to produce one; this is the backstop.
  constraint units_share_positive check (share_bps > 0),

  constraint units_building_id_unit_number_key unique (building_id, unit_number),

  -- The guardrail as schema. Referencing (id, building_id) rather than (id) alone means
  -- a unit can only point at an owner that already agrees about which building it is in;
  -- there is no combination of values that expresses a cross-building unit.
  --
  -- `on delete restrict`: an owner cannot be removed while a unit still points at them.
  -- With no deletion UI this is unreachable today and is the right default for the day
  -- one appears. It does not conflict with the cascade from buildings: deleting a
  -- building removes its units before its owners, so the restriction never sees an
  -- orphan (verified, not assumed).
  constraint units_owner_same_building_fkey
    foreign key (owner_id, building_id)
    references public.owners (id, building_id)
    on delete restrict
);

comment on table public.units is
  'The unit registry (rejestr lokali) of one building. Static in v1 (PRD Non-Goals): written
   once by public.import_building_units and never edited through a screen. share_bps is
   hundredths of a percent and totals exactly 10000 per building.';

create index units_building_id_idx on public.units (building_id);
create index units_owner_id_idx on public.units (owner_id);

-- One column on the existing table. `null` means "no registry imported yet" -- the state
-- every building starts in, including the S-01 demo building. Written by the import
-- function and by nothing else.
--
-- This is a denormalization, accepted deliberately: the value is recoverable at any time
-- as sum(units.area_m2), so storing it buys convenience rather than information. That is
-- exactly why buildings_registry_check below exists -- an aggregate kept in two places is
-- only worth having if something guarantees the two agree.
--
-- numeric(10,2) rather than (8,2): a per-unit area fits in eight digits, a sum of up to
-- a thousand of them does not.
alter table public.buildings
  add column total_area_m2 numeric(10,2)
  constraint buildings_total_area_positive check (total_area_m2 is null or total_area_m2 > 0);

comment on column public.buildings.total_area_m2 is
  'Total floor area of this building''s imported registry, in square metres. NULL until a
   registry is imported. Kept equal to sum(units.area_m2) by buildings_registry_check and
   units_registry_check -- do not write it by hand.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.owners enable row level security;
alter table public.units enable row level security;

-- Sixteen policies, eight per table: one per operation, per role. The shape is inherited
-- verbatim from public.buildings, including writing `anon` out explicitly rather than
-- leaving it to implicit deny -- in this product the unauthenticated path is real (owners
-- vote from an emailed per-unit link with no session), so every table has to make a
-- deliberate statement about it instead of inheriting silence. On these two tables that
-- statement is the only thing standing between owner personal data and the internet.
--
-- Why `authenticated` is still unconditional, against the prediction at
-- 20260801222109_create_buildings.sql:69. PRD Access Control states that v1 has no roles
-- model and every user in the database is an administrator; there is no table binding a
-- user to a building, and inventing one here would be designing the v2 access model
-- inside a file-import slice. A predicate that resolves to true for every caller is worse
-- than an honest `true` -- it reads as a restriction at review time while restricting
-- nothing. The real scoping arrives in S-02, when the per-unit token finally gives the
-- unauthenticated path a subject to scope TO. units_building_id_idx is created above so
-- that predicate lands on an indexed column when it comes.

-- owners: authenticated, full CRUD.

create policy "owners_select_authenticated"
  on public.owners
  for select
  to authenticated
  using (true);

create policy "owners_insert_authenticated"
  on public.owners
  for insert
  to authenticated
  with check (true);

-- update needs BOTH using and with check. `using` gates which rows may be touched;
-- `with check` gates what they may become.
create policy "owners_update_authenticated"
  on public.owners
  for update
  to authenticated
  using (true)
  with check (true);

create policy "owners_delete_authenticated"
  on public.owners
  for delete
  to authenticated
  using (true);

-- owners: anon, denied on every operation.

create policy "owners_select_anon"
  on public.owners
  for select
  to anon
  using (false);

create policy "owners_insert_anon"
  on public.owners
  for insert
  to anon
  with check (false);

create policy "owners_update_anon"
  on public.owners
  for update
  to anon
  using (false)
  with check (false);

create policy "owners_delete_anon"
  on public.owners
  for delete
  to anon
  using (false);

-- units: authenticated, full CRUD.

create policy "units_select_authenticated"
  on public.units
  for select
  to authenticated
  using (true);

create policy "units_insert_authenticated"
  on public.units
  for insert
  to authenticated
  with check (true);

create policy "units_update_authenticated"
  on public.units
  for update
  to authenticated
  using (true)
  with check (true);

create policy "units_delete_authenticated"
  on public.units
  for delete
  to authenticated
  using (true);

-- units: anon, denied on every operation.

create policy "units_select_anon"
  on public.units
  for select
  to anon
  using (false);

create policy "units_insert_anon"
  on public.units
  for insert
  to anon
  with check (false);

create policy "units_update_anon"
  on public.units
  for update
  to anon
  using (false)
  with check (false);

create policy "units_delete_anon"
  on public.units
  for delete
  to anon
  using (false);

-- ---------------------------------------------------------------------------
-- Registry invariants
-- ---------------------------------------------------------------------------

-- Two things stay true no matter which path writes: a building's shares total 100.00%,
-- and buildings.total_area_m2 equals the sum of that building's unit areas. The
-- `authenticated` policies above permit update and delete on all three tables, so
-- without this both would rest on nobody ever using the API directly.
--
-- A check constraint cannot span rows, so neither rule is expressible as a column or
-- table check. A deferred constraint trigger is the only in-database form -- and it must
-- be deferred, or row 1 of a 70-row insert is checked against a total of ~1.4% and fails.
--
-- The assertion is written once and called from both sides of the relationship, because
-- guarding the share total but not the area total would be the worse kind of
-- inconsistency: a reader would reasonably assume both aggregates carry the same
-- guarantee.

create function public.assert_building_registry(p_building_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unit_count integer;
  v_share_total integer;
  v_area_total numeric;
  v_stored_area numeric;
begin
  select count(*), coalesce(sum(u.share_bps), 0), coalesce(sum(u.area_m2), 0)
    into v_unit_count, v_share_total, v_area_total
    from public.units u
   where u.building_id = p_building_id;

  -- Leaves v_stored_area null when the building is gone, which is what a cascade delete
  -- looks like from in here: no building, no units, nothing to assert.
  select b.total_area_m2
    into v_stored_area
    from public.buildings b
   where b.id = p_building_id;

  if v_unit_count = 0 then
    -- A building with no units is a legal state -- it is the state every building starts
    -- in, and the one `db reset` leaves the demo building in. What is not legal is
    -- claiming a floor area for a registry that does not exist.
    if v_stored_area is not null then
      raise exception
        'Building % has no units but total_area_m2 is %', p_building_id, v_stored_area
        using errcode = 'EM004';
    end if;
    return;
  end if;

  if v_share_total <> 10000 then
    raise exception
      'Building % unit shares total % bps, expected 10000', p_building_id, v_share_total
      using errcode = 'EM003';
  end if;

  if v_stored_area is null or v_stored_area <> v_area_total then
    raise exception
      'Building % total_area_m2 is %, expected % (sum of unit areas)',
      p_building_id, v_stored_area, v_area_total
      using errcode = 'EM004';
  end if;
end;
$$;

comment on function public.assert_building_registry(uuid) is
  'Raises EM003 when a building''s unit shares do not total 10000 bps, or EM004 when
   buildings.total_area_m2 disagrees with sum(units.area_m2). Messages are English on
   purpose: this is not user-facing copy, the API route maps the codes to Polish.';

-- Two thin wrappers, because the building id lives under a different column name on each
-- side -- new.building_id on units, new.id on buildings. Both resolve it and delegate.

create function public.assert_units_registry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_building_registry(new.building_id);
  end if;

  -- An update that moves a unit between buildings leaves two registries to check, and
  -- the one it left is the one that quietly stops totalling 100%.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_building_registry(old.building_id);
  end if;

  return null;
end;
$$;

create function public.assert_buildings_registry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_building_registry(new.id);
  return null;
end;
$$;

-- `deferrable initially deferred` is load-bearing, not defensive: it is what lets the
-- import write units and buildings.total_area_m2 as two separate statements and still be
-- checked as one consistent state at commit.
--
-- Constraint triggers must be AFTER and FOR EACH ROW, so a 70-row import runs the
-- assertion 70 times at commit. At this size that is 70 aggregates over 70 rows and not
-- worth optimising; it is worth knowing before someone imports a thousand units.

create constraint trigger units_registry_check
  after insert or update or delete on public.units
  deferrable initially deferred
  for each row execute function public.assert_units_registry();

-- Without this second trigger, total_area_m2 would be editable to any value through a
-- direct update on buildings: the authenticated policy allows it and no unit row changes,
-- so the units-side trigger never fires.
create constraint trigger buildings_registry_check
  after insert or update on public.buildings
  deferrable initially deferred
  for each row execute function public.assert_buildings_registry();

-- ---------------------------------------------------------------------------
-- The import write path
-- ---------------------------------------------------------------------------

-- supabase-js has no multi-statement transaction, so "write owners and units
-- all-or-nothing" has exactly one implementation: a single rpc call into plpgsql.
--
-- security invoker, not definer. A definer function here would run as the table owner and
-- bypass every policy written above -- turning the one write path into the one RLS
-- bypass. Invoker means the caller's own policies decide, which is why step 1 below
-- doubles as an RLS check: a building the caller cannot see is a building that does not
-- exist, and EM001 is the right answer either way.
--
-- Default EXECUTE grants are left in place, so `anon` can call this. That is deliberate
-- and safe: with RLS in force an anonymous caller sees no building at all and gets EM001
-- before reaching any insert.
create function public.import_building_units(p_building_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unit_count integer;
begin
  if not exists (select 1 from public.buildings b where b.id = p_building_id) then
    raise exception 'Building % not found', p_building_id
      using errcode = 'EM001';
  end if;

  -- Re-import is refused by product decision (PRD Non-Goals): the registry is static, and
  -- changing shares mid-vote would move the S-05 threshold under a vote already cast.
  if exists (select 1 from public.units u where u.building_id = p_building_id) then
    raise exception 'Building % already has a unit registry', p_building_id
      using errcode = 'EM002';
  end if;

  with src as (
    select
      t.ordinality as row_no,
      btrim(t.r ->> 'unit_number') as unit_number,
      (t.r ->> 'area_m2')::numeric as area_m2,
      (t.r ->> 'share_bps')::integer as share_bps,
      btrim(t.r ->> 'full_name') as full_name,
      nullif(btrim(t.r ->> 'email'), '') as email,
      -- Rows sharing an e-mail collapse into one owner; rows without one stay separate,
      -- keyed by their position so two blank addresses are two people. The partial unique
      -- index on owners is the backstop if this key logic is ever wrong.
      coalesce(
        lower(nullif(btrim(t.r ->> 'email'), '')),
        'row:' || t.ordinality::text
      ) as owner_key
    from jsonb_array_elements(p_rows) with ordinality as t(r, ordinality)
  ),
  -- `materialized` is not decoration: owner_key is referenced twice below, and an inlined
  -- CTE would re-evaluate gen_random_uuid() per reference, handing the owners insert and
  -- the units insert two different sets of ids.
  owner_keys as materialized (
    select distinct on (s.owner_key)
      s.owner_key,
      gen_random_uuid() as owner_id,
      s.full_name,
      s.email
    from src s
    order by s.owner_key, s.row_no
  ),
  ins_owners as (
    insert into public.owners (id, building_id, full_name, email)
    select ok.owner_id, p_building_id, ok.full_name, ok.email
    from owner_keys ok
    returning 1
  ),
  ins_units as (
    insert into public.units (building_id, owner_id, unit_number, area_m2, share_bps)
    select p_building_id, ok.owner_id, s.unit_number, s.area_m2, s.share_bps
    from src s
    join owner_keys ok on ok.owner_key = s.owner_key
    returning 1
  )
  -- Data-modifying CTEs run to completion whether or not the primary query reads them,
  -- so ins_owners lands even though only ins_units is counted. Both inserts belong to one
  -- statement, so the composite foreign key is checked once, after both have run.
  select count(*) into v_unit_count from ins_units;

  -- Derived from the rows that actually landed rather than from the payload, so the
  -- stored total can only ever describe what is in the table. If this statement were ever
  -- dropped, the deferred trigger would fail the import loudly with EM004 rather than
  -- quietly storing nothing.
  update public.buildings
     set total_area_m2 = (
       select sum(u.area_m2) from public.units u where u.building_id = p_building_id
     )
   where id = p_building_id;

  return v_unit_count;
end;
$$;

comment on function public.import_building_units(uuid, jsonb) is
  'The only write path into the unit registry. p_rows is an ordered JSON array of
   { unit_number, area_m2, share_bps, full_name, email }, where area_m2 is a decimal
   STRING (never a JSON number -- no float touches the value on its way to numeric) and
   email is null when absent. Returns the number of units written. Raises EM001 when the
   building is not visible, EM002 when its registry is already populated.';

commit;
