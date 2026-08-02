-- One e-mail address belongs to one person.
--
-- Implementation review of S-01b found that import_building_units collapses rows sharing an
-- e-mail into a single owner (`distinct on (owner_key) order by owner_key, row_no`) and keeps
-- the FIRST name it sees. A file where the same address carried two different names therefore
-- stored one of them and dropped the other with no error -- and the preview screen, which
-- renders the parsed rows rather than what the function will collapse them to, had already
-- shown the administrator both names.
--
-- That is unrecoverable in v1: re-import is refused by EM002 and no screen edits a registry.
-- So the ambiguity is rejected instead of resolved. Co-ownership -- one unit held by several
-- people -- is a later version (PRD Non-Goals); until it exists, one address means one owner.
--
-- Enforced in two places on purpose. src/lib/units-csv.ts rejects the file first and names
-- both offending line numbers, which is the error an administrator can act on. This function
-- is the backstop: it is the only write path into the registry, and a caller reaching it
-- through the RPC directly must not be able to store what the parser refuses.
--
-- Forward-only, additive: replaces one function body, touches no table and no data.

begin;

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
   building is not visible, EM002 when its registry is already populated, EM005 when one
   e-mail address carries more than one owner name.';

commit;
