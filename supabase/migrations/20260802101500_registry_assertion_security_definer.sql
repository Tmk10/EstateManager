-- The registry assertion must not be defeatable by the caller's visibility.
--
-- Implementation review of S-01b found that assert_building_registry is `security invoker`,
-- so its `select ... from public.units` runs under the caller's own policies. That is
-- harmless today, because units_select_authenticated is `using (true)`. It stops being
-- harmless in S-02, which the previous migration's own comment commits to: the moment the
-- units select policy is scoped, a partially-visible caller aggregates a partial registry.
--
-- Demonstrated on the local stack before this migration was written. With the units select
-- policy temporarily set to `using (false)`:
--
--   select public.import_building_units(<building>, <2 units, 5000 bps each>);
--   -- COMMITS. Result: 2 units, sum(share_bps) = 10000, total_area_m2 = NULL, no error.
--
-- Two failures compound there. The `update public.buildings set total_area_m2 = (select
-- sum(area_m2) ...)` in the import reads through the same policy and writes NULL, and that
-- NULL then sends the assertion down its no-units early return instead of raising EM004.
-- Both invariants the deferred triggers exist to guarantee are void, silently, on the table
-- that decides vote outcomes.
--
-- An integrity check that the caller can defeat by seeing less is not an integrity check.
-- So the two READS become `security definer`.
--
-- Why this does not contradict the project's no-definer rule (CLAUDE.md): that rule protects
-- the single WRITE path. `import_building_units` stays `security invoker` precisely so that
-- a building the caller cannot see is a building that does not exist (EM001), and it is left
-- untouched here. The two functions below write nothing, take only a uuid, and return void
-- or a numeric total -- they cannot be used to read a row, modify one, or reach a table the
-- caller was denied. Both keep `set search_path = ''` and fully qualified references, which
-- is what makes a definer function safe to own.
--
-- EXECUTE is revoked from public and anon and granted to authenticated only, so the definer
-- boundary is reachable exactly from the role that already holds the policies. anon never
-- gets there in any case: it fails EM001 before the first insert.
--
-- Forward-only, additive: replaces function bodies, touches no table and no data.

begin;

-- ---------------------------------------------------------------------------
-- The shared assertion, now definer.
-- ---------------------------------------------------------------------------

create or replace function public.assert_building_registry(p_building_id uuid)
returns void
language plpgsql
security definer
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
   purpose: this is not user-facing copy, the API route maps the codes to Polish.
   SECURITY DEFINER since 20260802101500: an invoker assertion aggregates only the rows the
   caller can see, which would make both invariants void the moment S-02 scopes the units
   policies. Writes nothing, returns void.';

revoke execute on function public.assert_building_registry(uuid) from public, anon;
grant execute on function public.assert_building_registry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The area total the import stores, read through the same definer boundary.
-- ---------------------------------------------------------------------------

-- Exists so import_building_units cannot store a total derived from a partial view of the
-- registry it just wrote. Still derived from the rows that actually landed rather than from
-- the payload -- that property is what makes the stored total describe the table rather than
-- the request, and it is unchanged.
create or replace function public.building_units_area_total(p_building_id uuid)
returns numeric
language sql
security definer
stable
set search_path = ''
as $$
  select sum(u.area_m2) from public.units u where u.building_id = p_building_id;
$$;

comment on function public.building_units_area_total(uuid) is
  'Sum of a building''s unit areas, read independently of the caller''s RLS visibility.
   SECURITY DEFINER for the same reason as assert_building_registry: the value is an
   invariant, not a projection of what this caller happens to see. Returns null for a
   building with no units.';

revoke execute on function public.building_units_area_total(uuid) from public, anon;
grant execute on function public.building_units_area_total(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The import, unchanged apart from the total it stores.
-- ---------------------------------------------------------------------------

-- Still `security invoker`. That is the whole access contract of this function: step 1
-- doubles as the RLS check, because a building the caller cannot see is a building that
-- does not exist and EM001 is the right answer either way.
create or replace function public.import_building_units(p_building_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unit_count integer;
  v_conflict_email text;
begin
  if not exists (select 1 from public.buildings b where b.id = p_building_id) then
    raise exception 'Building % not found', p_building_id
      using errcode = 'EM001';
  end if;

  -- Serialise concurrent imports of the same building on its buildings row, so the
  -- emptiness check below and the inserts that trust it cannot interleave.
  --
  -- Two administrators confirming at once were already safe by accident: the closing
  -- `update public.buildings` serialised them, and the loser's deferred trigger re-read
  -- under a fresh READ COMMITTED snapshot and aborted. But it aborted with EM003 -- "the
  -- shares do not total 100%, report this as a bug" -- which is a lie told to someone who
  -- hit an ordinary race. Taking the lock here makes the loser fail EM002 instead, which
  -- is true, and makes the guarantee a stated one rather than a property that a later
  -- refactor could remove by moving one unrelated statement.
  perform 1 from public.buildings b where b.id = p_building_id for update;

  -- Re-import is refused by product decision (PRD Non-Goals): the registry is static, and
  -- changing shares mid-vote would move the S-05 threshold under a vote already cast.
  if exists (select 1 from public.units u where u.building_id = p_building_id) then
    raise exception 'Building % already has a unit registry', p_building_id
      using errcode = 'EM002';
  end if;

  -- Refuse before inserting anything: one address carrying two names is ambiguous, and the
  -- collapse below would resolve it by silently discarding the later one.
  select lower(btrim(t.r ->> 'email'))
    into v_conflict_email
    from jsonb_array_elements(p_rows) as t(r)
   where nullif(btrim(t.r ->> 'email'), '') is not null
   group by lower(btrim(t.r ->> 'email'))
  having count(distinct btrim(t.r ->> 'full_name')) > 1
   limit 1;

  if v_conflict_email is not null then
    raise exception 'E-mail % is used by more than one owner name', v_conflict_email
      using errcode = 'EM005';
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
      -- index on owners is the backstop if this key logic is ever wrong. The EM005 check
      -- above guarantees every row behind one key carries the same name, so which row the
      -- `distinct on` keeps no longer decides whose name is stored.
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

  -- Read through the definer helper rather than inline, so a scoped units select policy
  -- cannot make this store NULL for a registry that was just written. If this statement
  -- were ever dropped, the deferred trigger would fail the import loudly with EM004 rather
  -- than quietly storing nothing.
  update public.buildings
     set total_area_m2 = public.building_units_area_total(p_building_id)
   where id = p_building_id;

  return v_unit_count;
end;
$$;

comment on function public.import_building_units(uuid, jsonb) is
  'The only write path into the unit registry. p_rows is an ordered JSON array of
   { unit_number, area_m2, share_bps, full_name, email }, where area_m2 is a decimal
   STRING (never a JSON number -- no float touches the value on its way to numeric) and
   email is null when absent. Returns the number of units written. Raises EM001 when the
   building is not visible, EM002 when its registry is already populated, EM005 when one
   e-mail address carries more than one owner name. SECURITY INVOKER on purpose: step 1
   doubles as the RLS check. Only its reads of the registry invariants go through
   SECURITY DEFINER helpers.';

commit;
