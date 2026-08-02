-- Migration: create public.resolutions and public.voting_links, plus the one door through
--            which a caller with no session may read.
-- Purpose:   Roadmap S-02, PRD FR-003 / US-02. An administrator writes a resolution, opens
--            the vote, and from that moment every owner in the building holds exactly one
--            individual voting link. S-03 adds the vote itself; nothing here casts one.
-- Affects:   public.resolutions (new), public.voting_links (new), their row level security
--            policies (new), public.assert_resolution_frozen (new),
--            public.resolve_voting_link (new, SECURITY DEFINER -- see below).
--
-- One link per OWNER, not per unit. public.owners is already one row per person keyed by
-- e-mail address (20260802072737:48-51), so a per-unit link would send the same person
-- several messages and let them vote several times. PRD `## Functional Requirements`
-- records the rule and the date it changed (2026-08-02); this schema implements it.
--
-- This migration opens the first unauthenticated read path in the project. Every table so
-- far denies `anon` on all four operations, deliberately and explicitly, and that stays
-- true here -- the door is not a policy but a single SECURITY DEFINER function taking one
-- opaque token and returning a fixed, narrow row. See resolve_voting_link at the bottom.
--
-- Forward-only, like every migration before it. `supabase db push` has no rollback and
-- `wrangler rollback` reverts code, never schema, so the whole file runs in one
-- transaction: it either applies or it does not, and never lands half-way.

begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.resolutions (
  id uuid primary key default gen_random_uuid(),

  building_id uuid not null references public.buildings (id) on delete cascade,

  -- The community's own numbering ('1/2026', 'Uchwala nr 3'). Free text because it is
  -- theirs, not ours; unique per building case-insensitively, see the index below.
  number text not null,

  title text not null,

  body text not null,

  -- Text plus a check constraint rather than an enum. S-05 widens this list with 'passed'
  -- and 'rejected', and widening a check constraint is ordinary DDL inside this
  -- transaction, while `alter type ... add value` carries restrictions that make it
  -- awkward in a single-transaction migration file.
  status text not null default 'draft',

  -- Bound to the status by resolutions_opened_at_matches_status below: null exactly while
  -- the resolution is a draft, set from the moment voting opens.
  opened_at timestamptz,

  created_at timestamptz not null default now(),

  -- Trimmed-non-empty rather than plain not null, matching owners_full_name_not_blank:
  -- '   ' passes not null and is not a title. The API route trims before insert; this is
  -- the backstop for anything reaching the table by another path.
  constraint resolutions_number_not_blank check (length(trim(number)) > 0),
  constraint resolutions_title_not_blank check (length(trim(title)) > 0),
  constraint resolutions_body_not_blank check (length(trim(body)) > 0),

  constraint resolutions_status_known check (status in ('draft', 'open')),

  constraint resolutions_opened_at_matches_status check (
    (status = 'draft' and opened_at is null)
    or (status <> 'draft' and opened_at is not null)
  ),

  -- Not redundant with the primary key: this is the target of voting_links' composite
  -- foreign key below, and Postgres requires a unique constraint on exactly those columns.
  -- Same shape as owners_id_building_id_key.
  constraint resolutions_id_building_id_key unique (id, building_id)
);

comment on table public.resolutions is
  'One resolution (uchwala) of one building. Content is frozen once status leaves draft --
   see assert_resolution_frozen. status is draft or open in S-02; S-05 adds the outcome
   values. There is no end date: PRD FR-007 keeps voting open until a threshold is crossed.';

-- Case-insensitive, following 20260802063954_buildings_case_insensitive_unique.sql: '1/2026'
-- and '1/2026 ' differ only to a machine. Violation is SQLSTATE 23505, which the endpoint
-- maps to Polish.
create unique index resolutions_building_id_number_lower_key
  on public.resolutions (building_id, lower(number));

create table public.voting_links (
  id uuid primary key default gen_random_uuid(),

  resolution_id uuid not null,

  owner_id uuid not null,

  -- Denormalised, and it exists for exactly one reason: to carry the two composite foreign
  -- keys below. Nothing reads it as data.
  building_id uuid not null,

  -- The bearer secret. 32 bytes from crypto.getRandomValues, base64url without padding,
  -- which is 43 URL-safe characters -- see src/lib/voting-token.ts. The format check is a
  -- cheap backstop against a truncated or non-random value arriving from a future code
  -- path; it cannot prove randomness, only shape.
  token text not null,

  created_at timestamptz not null default now(),

  constraint voting_links_token_format check (token ~ '^[A-Za-z0-9_-]{43}$'),

  -- One link per owner per resolution. This is what makes pressing "Uruchom glosowanie"
  -- a second time idempotent rather than a source of duplicate links.
  constraint voting_links_resolution_owner_key unique (resolution_id, owner_id),

  -- The guardrail as schema, the same trick units_owner_same_building_fkey plays:
  -- referencing (id, building_id) rather than (id) alone means a link can only pair an
  -- owner and a resolution that already agree about which building they are in. A link
  -- across buildings is unrepresentable, not merely discouraged.
  --
  -- Cascade from the resolution side (deleting a resolution takes its links with it),
  -- restrict from the owner side (an owner cannot be removed while a link points at them).
  -- No product path deletes either in v1; these are the right defaults for the day one
  -- appears. Note for whoever builds that path: deleting a BUILDING races two cascade
  -- routes here -- buildings -> resolutions -> voting_links against buildings -> owners --
  -- and if owners go first the restrict fires. Verify it before shipping a delete screen;
  -- the fix, if needed, is to make the owner side cascade too.
  constraint voting_links_resolution_same_building_fkey
    foreign key (resolution_id, building_id)
    references public.resolutions (id, building_id)
    on delete cascade,

  constraint voting_links_owner_same_building_fkey
    foreign key (owner_id, building_id)
    references public.owners (id, building_id)
    on delete restrict
);

comment on table public.voting_links is
  'One voting link per owner per resolution -- per OWNER, not per unit: an owner holding
   two units votes once, with their shares summed. token is a bearer secret in a URL path;
   it must never be written to a log line or an error message. Owners with no e-mail
   address get no row here and no link, which costs them the link, not their weight in the
   S-05 tally.';

-- Also the lookup index for resolve_voting_link, so it is load-bearing twice: uniqueness
-- of the secret and the single-row probe the unauthenticated path makes.
create unique index voting_links_token_key on public.voting_links (token);

-- For S-04's per-owner send state, which walks the links of a resolution by owner.
create index voting_links_owner_id_idx on public.voting_links (owner_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.resolutions enable row level security;
alter table public.voting_links enable row level security;

-- Sixteen policies, eight per table: one per operation, per role. The shape is inherited
-- verbatim from public.units, including writing `anon` out explicitly rather than leaving
-- it to implicit deny. On voting_links that explicit denial is the point: without it, an
-- anon select policy would be the only way to serve the unauthenticated reader, and a
-- policy cannot know the token -- it would have to be `using (true)`, turning the table of
-- every secret in the building into a listable one.
--
-- Why `authenticated` is STILL unconditional, against the prediction at
-- 20260802072737:146-154. That comment committed S-02 to scoping these policies to a
-- building "when the per-unit token finally gives the unauthenticated path a subject to
-- scope TO". The prediction does not survive contact with the token: it identifies an
-- OWNER, not a logged-in user, and it is consumed by a SECURITY DEFINER function that
-- bypasses policies entirely -- so it hands the `authenticated` side no subject at all.
-- PRD `## Access Control` still states that v1 has no roles model and every user in the
-- database is an administrator, and there is still no table binding a user to a building.
-- A predicate that resolves to true for every caller reads as a restriction at review time
-- while restricting nothing. Scoping waits for the v2 roles model, and the next reader
-- should believe this comment rather than the older one.

-- resolutions: authenticated, full CRUD.

create policy "resolutions_select_authenticated"
  on public.resolutions
  for select
  to authenticated
  using (true);

create policy "resolutions_insert_authenticated"
  on public.resolutions
  for insert
  to authenticated
  with check (true);

-- update needs BOTH using and with check. `using` gates which rows may be touched;
-- `with check` gates what they may become.
create policy "resolutions_update_authenticated"
  on public.resolutions
  for update
  to authenticated
  using (true)
  with check (true);

create policy "resolutions_delete_authenticated"
  on public.resolutions
  for delete
  to authenticated
  using (true);

-- resolutions: anon, denied on every operation.

create policy "resolutions_select_anon"
  on public.resolutions
  for select
  to anon
  using (false);

create policy "resolutions_insert_anon"
  on public.resolutions
  for insert
  to anon
  with check (false);

create policy "resolutions_update_anon"
  on public.resolutions
  for update
  to anon
  using (false)
  with check (false);

create policy "resolutions_delete_anon"
  on public.resolutions
  for delete
  to anon
  using (false);

-- voting_links: authenticated, full CRUD.

create policy "voting_links_select_authenticated"
  on public.voting_links
  for select
  to authenticated
  using (true);

create policy "voting_links_insert_authenticated"
  on public.voting_links
  for insert
  to authenticated
  with check (true);

create policy "voting_links_update_authenticated"
  on public.voting_links
  for update
  to authenticated
  using (true)
  with check (true);

create policy "voting_links_delete_authenticated"
  on public.voting_links
  for delete
  to authenticated
  using (true);

-- voting_links: anon, denied on every operation.

create policy "voting_links_select_anon"
  on public.voting_links
  for select
  to anon
  using (false);

create policy "voting_links_insert_anon"
  on public.voting_links
  for insert
  to anon
  with check (false);

create policy "voting_links_update_anon"
  on public.voting_links
  for update
  to anon
  using (false)
  with check (false);

create policy "voting_links_delete_anon"
  on public.voting_links
  for delete
  to anon
  using (false);

-- ---------------------------------------------------------------------------
-- Content freeze
-- ---------------------------------------------------------------------------

-- "Glos jest ostateczny" must not rest on the UI declining to offer an edit button. Once a
-- resolution leaves draft, its content is what the owners were asked to vote on, and the
-- database is where that stops being editable.
--
-- Fires on every update of public.resolutions, so it also guards paths that do not exist
-- yet -- S-05's outcome flip will pass through here.
--
-- security invoker: it decides nothing about visibility, only about the shape of a
-- transition the caller already has permission to attempt.
create function public.assert_resolution_frozen()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     and (new.number is distinct from old.number
          or new.title is distinct from old.title
          or new.body is distinct from old.body
          or new.building_id is distinct from old.building_id) then
    raise exception
      'Resolution % is % and its content can no longer be changed', old.id, old.status
      using errcode = 'EM006';
  end if;

  -- draft -> open is the only transition S-02 knows. A no-op update (status unchanged) is
  -- allowed, which is what lets the freeze check above be the one that speaks for content
  -- edits. open -> draft is refused here rather than merely being absent from the UI.
  if new.status is distinct from old.status
     and not (old.status = 'draft' and new.status = 'open') then
    raise exception
      'Resolution % cannot move from % to %', old.id, old.status, new.status
      using errcode = 'EM007';
  end if;

  return new;
end;
$$;

comment on function public.assert_resolution_frozen() is
  'Raises EM006 when a resolution that has left draft has its number, title, body or
   building changed, and EM007 on any status transition other than draft -> open. Messages
   are English on purpose: this is not user-facing copy, the API route maps the codes to
   Polish, the same split as EM001-EM005.';

create trigger resolutions_freeze_check
  before update on public.resolutions
  for each row execute function public.assert_resolution_frozen();

-- ---------------------------------------------------------------------------
-- The one door for a caller with no session
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER, and this does not contradict the project's no-definer rule (CLAUDE.md).
-- That rule protects the single WRITE path: import_building_units stays `security invoker`
-- precisely so a building the caller cannot see is EM001. This function writes nothing,
-- takes one opaque token, returns a fixed narrow row, keeps `set search_path = ''` and
-- fully qualified references, and is the only alternative to giving `anon` a select policy
-- on voting_links -- which, since a policy cannot know the token, would mean `using (true)`
-- and a listable table of every secret in the building.
--
-- Zero rows IS the entire error model. An unknown token, a truncated token, and a token
-- whose resolution is still a draft all produce the same empty result, so the page cannot
-- leak the difference between "no such token" and "token exists but you are early". The
-- `r.status <> 'draft'` filter is what makes the third case indistinguishable, and it is
-- required by the way links are created: they are inserted BEFORE the status flips, so a
-- token attached to a draft resolution exists legitimately and must resolve to nothing.
create function public.resolve_voting_link(p_token text)
returns table (
  resolution_number text,
  resolution_title text,
  resolution_body text,
  resolution_status text,
  owner_full_name text,
  owner_share_bps integer,
  owner_unit_numbers text[],
  building_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.number,
    r.title,
    r.body,
    r.status,
    o.full_name,
    coalesce(agg.share_bps, 0)::integer,
    coalesce(agg.unit_numbers, array[]::text[]),
    b.name
  from public.voting_links vl
  join public.resolutions r on r.id = vl.resolution_id
  join public.owners o on o.id = vl.owner_id
  join public.buildings b on b.id = vl.building_id
  left join lateral (
    select
      sum(u.share_bps)::integer as share_bps,
      array_agg(u.unit_number order by u.unit_number) as unit_numbers
    from public.units u
    where u.owner_id = o.id
  ) agg on true
  where vl.token = p_token
    and r.status <> 'draft';
$$;

comment on function public.resolve_voting_link(text) is
  'Turns one voting token into the reader''s own view of a resolution. THIS RETURN LIST IS
   THE ENTIRE VISIBILITY CONTRACT FOR A CALLER WITH NO SESSION: no e-mail address, no other
   owner, no per-unit area, no vote, no building address. Adding a column here widens what
   the internet can read, so it is a security change, not a convenience. owner_share_bps is
   the SUM of that owner''s units (per-owner voting, 2026-08-02) and owner_unit_numbers
   names them, so the reader can tell which units the weight covers -- both are the
   reader''s own data. Returns zero rows for an unknown token and for a token whose
   resolution is still a draft, indistinguishably, which is the whole error model.';

revoke execute on function public.resolve_voting_link(text) from public;
grant execute on function public.resolve_voting_link(text) to anon, authenticated;

commit;
