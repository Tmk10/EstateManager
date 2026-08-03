-- Migration: create public.votes and the single door through which a caller with no
--            session may write one.
-- Purpose:   Roadmap S-03, PRD FR-005 / FR-006 / US-03. An owner opens their individual
--            link and casts a final `za` or `przeciw` weighted by the summed udzialy of
--            their lokale. This is the roadmap's north star: the only place the product's
--            central claim -- blokada jest nieobecnosc, a nie sprzeciw -- can be confirmed
--            or refuted. Nothing here tallies, compares against a threshold, or writes an
--            outcome; that is S-05.
-- Affects:   public.votes (new), its row level security policies (new),
--            public.assert_vote_immutable (new), public.cast_vote (new, SECURITY DEFINER
--            -- see the argument below), public.resolve_voting_link (dropped and recreated
--            with two columns added).
--
-- Applies AFTER 20260803090000_harden_voting_links_and_resolutions, which makes a delivered
-- token unrepointable and an open resolution undeletable. Both were prerequisites: this
-- file is what turns them from theoretical into load-bearing.
--
-- Forward-only, one transaction. resolve_voting_link is dropped and recreated inside it, so
-- there is no window in which the unauthenticated read path is missing.

begin;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table public.votes (
  id uuid primary key default gen_random_uuid(),

  resolution_id uuid not null,

  owner_id uuid not null,

  -- Denormalised for exactly one reason, the same one as voting_links.building_id: to carry
  -- the two composite foreign keys below. Nothing reads it as data.
  building_id uuid not null,

  -- Which link this vote arrived through. Not the same fact as owner_id: the owner is WHO
  -- voted, this is the credential that was presented. Keeping it is what lets S-04's send
  -- log and a cast vote be joined up later if a delivery is ever disputed.
  voting_link_id uuid not null references public.voting_links (id) on delete cascade,

  -- Text plus a check constraint rather than an enum, for the same reason
  -- resolutions_status_known is one: widening a check constraint is ordinary DDL inside a
  -- migration transaction. English values, like every other stored enumeration in this
  -- schema; the Polish "Za" / "Przeciw" is presentation and lives in the page.
  -- There is no third value: PRD Non-Goals rules out "wstrzymuje sie" in v1.
  choice text not null,

  -- The weight this vote carried, SNAPSHOTTED at the moment it was cast rather than
  -- recomputed when it is read. The registry is static in v1 (import_building_units raises
  -- EM002 on re-import and no screen edits it), so today this stores what a recomputation
  -- would produce. It exists so S-06 can show WHICH udzialy made a result by reading the
  -- votes, rather than by reconstructing what the shares happen to be at the time someone
  -- asks. If the registry ever gains an edit path, this column is authoritative and the
  -- live sum is not.
  share_bps integer not null,

  -- The DATABASE's clock, unlike resolutions.opened_at, which is written from the Worker's
  -- (S-02 implementation review, finding F5). S-05 must not difference the two without
  -- deciding that first.
  created_at timestamptz not null default now(),

  -- One vote per owner per resolution. This is the identity of a vote, not a convenience:
  -- it is the first of the three independent things that make a second cast impossible,
  -- and it is what cast_vote's `on conflict do nothing` is written against.
  constraint votes_resolution_owner_key unique (resolution_id, owner_id),

  constraint votes_choice_known check (choice in ('for', 'against')),

  -- An owner with no units has no weight and cannot cast a vote that means anything. Not
  -- reachable in v1 -- import_building_units only ever creates an owner from a unit row --
  -- so this is the backstop that keeps a zero-weight row from being stored silently.
  constraint votes_share_bps_positive check (share_bps > 0),

  -- The guardrail as schema, the same trick units_owner_same_building_fkey and
  -- voting_links_*_same_building_fkey play: referencing (id, building_id) rather than (id)
  -- alone means a vote can only pair an owner and a resolution that already agree about
  -- which building they are in. A vote across buildings is unrepresentable, not merely
  -- discouraged.
  --
  -- Cascade from the resolution side, restrict from the owner side -- mirroring
  -- voting_links. Note that both cascade paths are now unreachable for a resolution that
  -- has any votes: EM009 (previous migration) refuses to delete an open resolution, and a
  -- draft resolution cannot have votes, since cast_vote requires status = 'open'.
  constraint votes_resolution_same_building_fkey
    foreign key (resolution_id, building_id)
    references public.resolutions (id, building_id)
    on delete cascade,

  constraint votes_owner_same_building_fkey
    foreign key (owner_id, building_id)
    references public.owners (id, building_id)
    on delete restrict
);

comment on table public.votes is
  'One cast vote: one owner, one resolution, one choice, weighted by the SUM of that
   owner''s units at the moment of casting. Per OWNER, not per unit -- a person holding two
   lokale votes once, with their shares summed, matching voting_links. Immutable: see
   assert_vote_immutable and the policies below, which deny writes to every role. The only
   writer is public.cast_vote. share_bps is a snapshot and is authoritative over any later
   recomputation. No request metadata is recorded -- an IP address would be personal data of
   someone who never received a privacy notice.';

-- No extra index. votes_resolution_owner_key already covers both readers: the
-- resolution-scoped count on the administrator's page, and resolve_voting_link's left join
-- on (resolution_id, owner_id).

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.votes enable row level security;

-- Eight policies, one per operation per role, following the shape inherited from
-- public.buildings -- with ONE DELIBERATE DEVIATION that a later reader must not "fix":
--
--   insert, update and delete are `false` for BOTH roles, including `authenticated`.
--
-- Every other table in this schema gives `authenticated` unconditional write access,
-- because PRD `## Access Control` says every user in the database is an administrator.
-- This table does not, and the reason is the product rule: glos jest ostateczny. An
-- administrator who could insert into this table could cast any owner's vote, and one who
-- could update it could change one after the fact -- neither is a power the product grants
-- anyone, so it is denied at the table rather than merely left out of the UI.
--
-- The only writer is public.cast_vote, which is SECURITY DEFINER and therefore not subject
-- to any of this. That is not a loophole in the deny -- it is the point: the write path is
-- exactly one named, reviewable function, and these policies are what makes it exactly one.
--
-- select is `true` for `authenticated` (S-05 reads the tally, S-03 counts the voters) and
-- `false` for `anon`, which stays explicit rather than implicit for the same reason it does
-- everywhere else: a denial that is written down survives a refactor that a missing policy
-- does not. An unauthenticated reader sees their OWN vote through resolve_voting_link, and
-- nothing else.
--
-- Why `authenticated` select is still unconditional: unchanged from 20260802181500:163-172.
-- v1 has no roles model and no table binding a user to a building, so a predicate that
-- resolves to true for every caller would read as a restriction at review time while
-- restricting nothing. Scoping waits for the v2 roles model.

create policy "votes_select_authenticated"
  on public.votes
  for select
  to authenticated
  using (true);

create policy "votes_insert_authenticated"
  on public.votes
  for insert
  to authenticated
  with check (false);

-- update needs BOTH using and with check. `using` gates which rows may be touched,
-- `with check` gates what they may become; both are false here.
create policy "votes_update_authenticated"
  on public.votes
  for update
  to authenticated
  using (false)
  with check (false);

create policy "votes_delete_authenticated"
  on public.votes
  for delete
  to authenticated
  using (false);

create policy "votes_select_anon"
  on public.votes
  for select
  to anon
  using (false);

create policy "votes_insert_anon"
  on public.votes
  for insert
  to anon
  with check (false);

create policy "votes_update_anon"
  on public.votes
  for update
  to anon
  using (false)
  with check (false);

create policy "votes_delete_anon"
  on public.votes
  for delete
  to anon
  using (false);

-- ---------------------------------------------------------------------------
-- Immutability, at the one caller the policies do not reach
-- ---------------------------------------------------------------------------

-- Not redundant with the policies above, and the difference matters. RLS constrains
-- PostgREST callers -- `anon` and `authenticated`. cast_vote runs as the function owner and
-- bypasses RLS entirely, so this trigger is the ONLY constraint that binds the write path
-- itself, and the only one that would still be standing if a future definer function were
-- written carelessly.
--
-- Unconditional: there is no legitimate update of a vote and no legitimate delete of one.
-- Withdrawal and vote-changing are PRD Non-Goals. An insert is not covered -- that is what
-- cast_vote does, and the unique constraint is what stops it happening twice.
create function public.assert_vote_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'Vote % is final and can be neither changed nor withdrawn', old.id
    using errcode = 'EM010';
end;
$$;

comment on function public.assert_vote_immutable() is
  'Raises EM010 on every update and every delete of a row in public.votes, unconditionally.
   The policies on that table already deny both to anon and authenticated; this exists
   because public.cast_vote is SECURITY DEFINER and bypasses them, so a trigger is the only
   thing that binds the write path itself. Message is English on purpose: this is not
   user-facing copy, the API route maps the code to Polish, the same split as EM001-EM009.';

create trigger votes_immutable_check
  before update or delete on public.votes
  for each row execute function public.assert_vote_immutable();

-- ---------------------------------------------------------------------------
-- The one write door for a caller with no session
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER, and this is the project's FIRST security definer WRITE. CLAUDE.md's
-- no-definer rule exists to prevent exactly that, so this migration argues the exception
-- rather than assuming it.
--
-- What the rule protects: the single write path into the unit registry.
-- import_building_units stays `security invoker` precisely so that a building the caller
-- cannot see is a building that does not exist (EM001) -- there, the caller's identity is
-- the access check, and a definer write would turn the single write path into the single
-- RLS bypass. The two READS that were flipped to definer in 20260802101500 were flipped
-- because an invoker assertion aggregates only the rows the caller can see.
--
-- Why this write is different: there is no caller identity to preserve. The caller is
-- `anon`, which is denied on all four operations on every table in this schema by design,
-- and a policy cannot see a bearer token -- so there is no RLS-shaped way to let an
-- unauthenticated voter insert. The alternative is an `anon` insert policy, which requires
-- the browser to post its own owner_id, its own resolution_id, its own share_bps and the
-- token as a column, and requires the policy to be `using (true)` because it cannot check
-- the token. That is strictly worse than what S-02 already rejected for the read path.
--
-- What makes it safe to own, the same list resolve_voting_link satisfies: it takes one
-- opaque token and one closed-vocabulary string, it names no owner, resolution, building or
-- weight -- it resolves and sums all four itself -- it writes exactly one row into exactly
-- one table, it keeps `set search_path = ''` with fully qualified references, and it
-- returns a fixed narrow row that is the caller's own data.
--
-- ZERO ROWS IS THE ERROR MODEL, exactly as it is for resolve_voting_link. An unknown token,
-- a truncated token, and a token whose resolution is still a draft all produce the same
-- empty result, so the caller cannot learn the difference between "no such token" and
-- "token exists but you are early". Any new branch that answers differently before the
-- token has resolved turns the token space into something worth probing.
--
-- The one exception is p_choice, which is rejected loudly (EM011) BEFORE any lookup. It is
-- the only input the caller controls that says nothing about the token space -- the refusal
-- is identical for a real token and a made-up one, because no lookup has happened yet -- so
-- being specific here costs nothing and makes a genuine client bug findable.
create function public.cast_vote(p_token text, p_choice text)
returns table (
  vote_recorded boolean,
  vote_choice text,
  voted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link record;
  v_share_bps integer;
  v_recorded boolean;
begin
  -- Before any lookup: see the note above on why this one may speak.
  if p_choice is null or p_choice not in ('for', 'against') then
    raise exception 'Unknown vote choice'
      using errcode = 'EM011';
  end if;

  select vl.id, vl.owner_id, vl.resolution_id, vl.building_id
    into v_link
    from public.voting_links vl
    join public.resolutions r on r.id = vl.resolution_id
   where vl.token = p_token
     and r.status = 'open';

  -- Unknown token, truncated token, draft resolution: one answer for all three.
  if not found then
    return;
  end if;

  select coalesce(sum(u.share_bps), 0)::integer
    into v_share_bps
    from public.units u
   where u.owner_id = v_link.owner_id;

  -- Unreachable in v1 (an owner exists only because a unit row created them), and the
  -- votes_share_bps_positive check would reject the row anyway. Answering with zero rows
  -- rather than an exception keeps this on the neutral path, which is the safe direction
  -- for a case that should not exist.
  if v_share_bps <= 0 then
    return;
  end if;

  insert into public.votes (
    resolution_id, owner_id, building_id, voting_link_id, choice, share_bps
  )
  values (
    v_link.resolution_id, v_link.owner_id, v_link.building_id, v_link.id,
    p_choice, v_share_bps
  )
  on conflict (resolution_id, owner_id) do nothing;

  -- `on conflict do nothing` is load-bearing, for the same reason the upsert in
  -- open.ts is: a double submit must return the vote that exists rather than raise 23505 on
  -- a path that must not leak whether a row exists. FOUND is false exactly when the
  -- conflict fired, which is what distinguishes "this call recorded it" from "it was
  -- already there" -- the two differ in the endpoint's copy, never in what is stored.
  v_recorded := found;

  return query
    select v_recorded, vt.choice, vt.created_at
      from public.votes vt
     where vt.resolution_id = v_link.resolution_id
       and vt.owner_id = v_link.owner_id;
end;
$$;

comment on function public.cast_vote(text, text) is
  'The only write path into public.votes. Takes one voting token and one of ''for'' /
   ''against'', resolves the link and sums the owner''s units itself -- the caller never
   names an owner, a resolution, a building or a weight -- and stores exactly one row.
   Returns one narrow row: whether THIS call recorded the vote, plus the stored choice and
   timestamp, all of which are the reader''s own data. Returns ZERO ROWS for an unknown
   token, a truncated token, and a token whose resolution is still a draft,
   indistinguishably, which is the whole error model of the unauthenticated path. Raises
   EM011 for a choice outside the vocabulary, before any lookup, which is why it may be
   specific. A second call with the same token returns the vote already stored: casting
   twice is refused by votes_resolution_owner_key, by the policies, and by
   assert_vote_immutable, at three different callers. SECURITY DEFINER, and the project''s
   first definer WRITE -- the argument for the exception is in the comment above the
   function and must be read before another one is added.';

revoke execute on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The read contract, widened by the reader's own vote
-- ---------------------------------------------------------------------------

-- Dropped and recreated rather than `create or replace`: Postgres refuses to replace a
-- function whose return type changes, and adding columns to a `returns table` changes it.
-- Inside this transaction, so the unauthenticated read path is never missing. A dropped
-- function takes its ACL with it, so the revoke/grant pair is re-issued below -- forgetting
-- that would leave the door shut and every voting link dead.
drop function public.resolve_voting_link(text);

create function public.resolve_voting_link(p_token text)
returns table (
  resolution_number text,
  resolution_title text,
  resolution_body text,
  resolution_status text,
  owner_full_name text,
  owner_share_bps integer,
  owner_unit_numbers text[],
  building_name text,
  own_vote_choice text,
  own_voted_at timestamptz
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
    b.name,
    v.choice,
    v.created_at
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
  -- The reader's OWN vote and nothing else. Joined on both columns of the unique
  -- constraint, so it can match at most one row, and on o.id rather than on anything the
  -- caller supplied -- there is no shape of this join that could return another owner's
  -- vote, and there must never be one.
  left join public.votes v
    on v.resolution_id = r.id
   and v.owner_id = o.id
  where vl.token = p_token
    and r.status <> 'draft';
$$;

comment on function public.resolve_voting_link(text) is
  'Turns one voting token into the reader''s own view of a resolution. THIS RETURN LIST IS
   THE ENTIRE VISIBILITY CONTRACT FOR A CALLER WITH NO SESSION: no e-mail address, no other
   owner, no per-unit area, no other owner''s vote, no building address. Adding a column
   here widens what the internet can read, so it is a security change, not a convenience.
   owner_share_bps is the SUM of that owner''s units (per-owner voting, 2026-08-02) and
   owner_unit_numbers names them, so the reader can tell which units the weight covers.
   own_vote_choice and own_voted_at were added by S-03 and meet the same standard the rest
   of the list does -- they are the reader''s OWN vote, the confirmation PRD FR-005
   promises, and what a second visit to the link renders. They are null until that reader
   votes. NO OTHER OWNER''S VOTE MAY EVER JOIN THIS LIST: how someone else voted is the
   question S-06 is scoped to answer, and until it does the answer is no. Returns zero rows
   for an unknown token and for a token whose resolution is still a draft,
   indistinguishably, which is the whole error model.';

revoke execute on function public.resolve_voting_link(text) from public;
grant execute on function public.resolve_voting_link(text) to anon, authenticated;

commit;
