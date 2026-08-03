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

commit;
