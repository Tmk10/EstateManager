-- Migration: close the two gaps the S-02 implementation review marked blocking for S-03.
-- Purpose:   Roadmap S-03. Before a single vote is stored, make "a live token cannot be
--            reassigned to another person" and "an open resolution cannot be deleted"
--            properties of the database rather than properties of the absence of a UI
--            button -- the same argument assert_resolution_frozen already makes for
--            resolution content.
-- Affects:   public.assert_voting_link_frozen (new), public.assert_resolution_deletable
--            (new), and one trigger on each of public.voting_links and public.resolutions.
--
-- Both gaps are harmless while no votes exist and reachable the moment they do. They are
-- named in context/changes/resolution-with-voting-links/reviews/impl-review-phase-3-4.md
-- (finding F10, Block: yes):
--
--   1. Nothing refuses `update public.voting_links set owner_id = ...`. The composite
--      foreign key voting_links_owner_same_building_fkey permits reassigning a live token
--      to a different person WITHIN the same building, because both rows agree about the
--      building. That is a way to swap the voter behind an already-delivered link.
--   2. Nothing refuses `delete from public.resolutions` on an open resolution.
--      assert_resolution_frozen is a `before update` trigger and never sees a delete, and
--      the delete cascades every voting link (and, from the next migration, every vote)
--      away with it.
--
-- Forward-only, like every migration before it. One transaction: it either applies or it
-- does not, and never lands half-way. This file must apply BEFORE 20260803090500_create_votes
-- -- the filename timestamps carry that order, and both are additive, so nothing here
-- depends on public.votes existing.

begin;

-- ---------------------------------------------------------------------------
-- A delivered token keeps pointing at the person it was delivered to
-- ---------------------------------------------------------------------------

-- security invoker: it decides nothing about visibility, only about the shape of an update
-- the caller already has permission to attempt. Same posture as assert_resolution_frozen.
--
-- building_id is deliberately NOT in the frozen list. It is denormalised solely to carry
-- the two composite foreign keys (20260802181500:93-95) and nothing reads it as data; a
-- change to it that moved the row to another building would be rejected by both foreign
-- keys anyway, and a change that did not is a no-op. Freezing it here would add a second
-- answer to a question the foreign keys already answer.
--
-- created_at stays editable for the same reason: it is a record of when the link was
-- minted, not part of the credential, and refusing to touch it would make this a blanket
-- immutability trigger rather than a statement about what a link IS.
create function public.assert_voting_link_frozen()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.token is distinct from old.token
     or new.owner_id is distinct from old.owner_id
     or new.resolution_id is distinct from old.resolution_id then
    raise exception
      'Voting link % identifies a voter and cannot be repointed', old.id
      using errcode = 'EM008';
  end if;

  return new;
end;
$$;

comment on function public.assert_voting_link_frozen() is
  'Raises EM008 when a voting link''s token, owner or resolution is changed. Those three
   columns ARE the credential: the token is what a holder presents, and the owner and
   resolution are what it buys them. Reassigning any of them after delivery hands one
   person''s vote to another. building_id and created_at are deliberately not frozen --
   see the comment above the function. Message is English on purpose: this is not
   user-facing copy, the API route maps the code to Polish, the same split as EM001-EM007.';

create trigger voting_links_freeze_check
  before update on public.voting_links
  for each row execute function public.assert_voting_link_frozen();

-- ---------------------------------------------------------------------------
-- A resolution that has been put to the vote cannot be deleted
-- ---------------------------------------------------------------------------

-- The delete is the hole in the freeze that assert_resolution_frozen leaves: it refuses to
-- let an open resolution's content change (EM006) and to let it go back to draft (EM007),
-- and then a `delete` removes the whole question along with every link and, from the next
-- migration, every vote cast on it. "Glos jest ostateczny" cannot survive a path that
-- deletes the thing voted on.
--
-- A draft resolution stays deletable: nobody has been asked anything yet, no link has been
-- delivered (links are minted when the vote opens), and an administrator who mistyped a
-- number should be able to remove it. No screen does this in v1 -- the rule exists for the
-- day one appears, and for anything reaching the table by another path.
--
-- Note what this does NOT block: deleting the BUILDING still cascades to its resolutions,
-- and a cascade delete fires this trigger too, so an open resolution now makes its building
-- undeletable. That is the correct direction (a building with a live vote is not a mistake
-- to be cleaned up), and no product path deletes a building in v1 -- see the cascade-race
-- note at 20260802181500:117-122, which this does not resolve and does not worsen.
create function public.assert_resolution_deletable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception
      'Resolution % is % and can no longer be deleted', old.id, old.status
      using errcode = 'EM009';
  end if;

  return old;
end;
$$;

comment on function public.assert_resolution_deletable() is
  'Raises EM009 on any delete of a resolution that has left draft. Deleting an open
   resolution would cascade its voting links -- and its votes -- away, which is the one
   erasure the content freeze (EM006/EM007) does not cover. Drafts stay deletable: nothing
   has been asked and no link has been delivered. Message is English on purpose: this is not
   user-facing copy, the API route maps the code to Polish, the same split as EM001-EM007.';

create trigger resolutions_delete_check
  before delete on public.resolutions
  for each row execute function public.assert_resolution_deletable();

-- ---------------------------------------------------------------------------
-- The electorate is fixed when the vote opens
-- ---------------------------------------------------------------------------

-- EM008 above stops a live link being REPOINTED. On its own that is not enough, and the
-- gap was found by reproducing it rather than by reading: `voting_links` still carries
-- `insert` and `delete` policies of `true` for `authenticated` (inherited from S-02, where
-- they were harmless because no vote existed), so delete-then-insert routes straight around
-- the freeze. Executed against the local stack as a plain signed-in administrator, with no
-- superuser and without ever reading a token:
--
--   PATCH  voting_links (repoint one link)                   -> EM008, refused
--   DELETE voting_links?id=eq.<a link>                       -> 204
--   POST   voting_links {owner_id: <that owner>, token: ...} -> 201
--   POST   rpc/cast_vote {that token, 'against'} as anon     -> vote_recorded: true
--
-- One owner's binding vote, cast at their full weight by someone who is not them. The two
-- triggers below close that route, so that "a vote cannot be cast by anyone but the link's
-- holder" is refused by the database rather than by the absence of a screen.
--
-- Together with EM008 and the unique constraint voting_links_resolution_owner_key, the
-- electorate of an open resolution is now closed under every operation: a link cannot be
-- repointed (EM008), cannot be deleted (EM013), and cannot be re-issued -- a new link is
-- refused outright when none exists (EM012), and when one does exist the unique constraint
-- refuses the duplicate.
--
-- What this deliberately costs: an owner who had no e-mail address when the vote opened
-- (open.ts skips them) can no longer be given a link afterwards. That matches the rule S-02
-- already stated -- such an owner loses the link, not their weight in the S-05 tally -- and
-- the alternative is a hole big enough to add a voter to a running vote.

-- Note the `not exists` clause, which is load-bearing and not defensive padding. open.ts
-- mints links with an upsert carrying `on conflict do nothing`, and a `before insert`
-- trigger fires BEFORE the conflict is detected -- so an unconditional refusal here would
-- break the idempotent second press of "Uruchom glosowanie" on an already-open resolution,
-- a path that endpoint deliberately supports. Refusing only links that would genuinely be
-- NEW leaves that press a no-op, exactly as it is today.
create function public.assert_voting_link_issuable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select r.status into v_status
    from public.resolutions r
   where r.id = new.resolution_id;

  if v_status is not null
     and v_status <> 'draft'
     and not exists (
       select 1
         from public.voting_links vl
        where vl.resolution_id = new.resolution_id
          and vl.owner_id = new.owner_id
     ) then
    raise exception
      'Resolution % is % and no new voting link may be issued for it',
      new.resolution_id, v_status
      using errcode = 'EM012';
  end if;

  return new;
end;
$$;

comment on function public.assert_voting_link_issuable() is
  'Raises EM012 when a NEW voting link is issued for a resolution that has left draft --
   which would add a voter to a vote already running, or hand an existing owner a second
   token the administrator chose. Links for an owner who already holds one are allowed
   through so that open.ts''s `on conflict do nothing` upsert stays idempotent on a second
   press; the unique constraint is what refuses them afterwards. Message is English on
   purpose: this is not user-facing copy, the API route maps the code to Polish.';

create trigger voting_links_issuable_check
  before insert on public.voting_links
  for each row execute function public.assert_voting_link_issuable();

-- The other half. Without this, EM012 is trivially bypassed: delete the link first, and the
-- owner no longer "already holds one".
--
-- v_status is null when the resolution row is already gone, which is what a cascade looks
-- like from in here -- the parent delete is visible to the referential-integrity trigger
-- that runs the cascade. EM009 guarantees such a cascade can only ever start from a draft
-- resolution, so allowing the null case does not reopen anything.
create function public.assert_voting_link_deletable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select r.status into v_status
    from public.resolutions r
   where r.id = old.resolution_id;

  if v_status is not null and v_status <> 'draft' then
    raise exception
      'Resolution % is % and its voting links can no longer be deleted',
      old.resolution_id, v_status
      using errcode = 'EM013';
  end if;

  return old;
end;
$$;

comment on function public.assert_voting_link_deletable() is
  'Raises EM013 on any delete of a voting link belonging to a resolution that has left
   draft. Deleting a delivered link disenfranchises its holder, and -- paired with the
   insert policy -- was the way around both EM008 and EM012. Links of a draft resolution
   stay deletable, including through the cascade when the draft itself is deleted. Message
   is English on purpose: this is not user-facing copy, the API route maps the code to
   Polish.';

create trigger voting_links_delete_check
  before delete on public.voting_links
  for each row execute function public.assert_voting_link_deletable();

commit;
