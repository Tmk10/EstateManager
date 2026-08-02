-- Migration: make the buildings uniqueness check case-insensitive
-- Purpose:   Replace the exact-text unique constraint on public.buildings with a
--            case-insensitive unique index. Follow-up to the S-01 review (finding F6,
--            context/changes/building-create/reviews/impl-review.md).
-- Affects:   public.buildings -- drops constraint buildings_name_city_street_key,
--            adds unique index buildings_name_city_street_lower_key.
--
-- Why: 20260801222109_create_buildings.sql justified splitting the address into `city`
-- and `street` on the grounds that a single free-text field defeats the unique
-- constraint -- 'ul. Kwiatowa 3, Warszawa' and 'Warszawa, Kwiatowa 3' being the same
-- building and two different strings. Splitting fixed the ordering variants, but the
-- constraint still compares raw text, so 'Kwiatowa 3' and 'kwiatowa 3' remain two rows.
-- Lower-casing the comparison closes that gap.
--
-- Known residual, deliberately not addressed here: internal whitespace is still
-- significant, so 'Kwiatowa  3' (double space) is distinct from 'Kwiatowa 3'. Collapsing
-- runs of whitespace would mean normalising on write as well as on compare, which is a
-- larger decision than this follow-up. Revisit if duplicates show up in practice.
--
-- Forward-only. `supabase db push` has no rollback, so the whole file runs in one
-- transaction: it either applies or it does not, and never lands half-way.
--
-- Applying this is a manual step (`npx supabase db push` from a linked checkout) --
-- nothing in CI applies migrations. Open residual G14.

begin;

-- Dropping the constraint drops the index that backs it. Nothing references it by name:
-- the endpoint at src/pages/api/buildings/index.ts matches on SQLSTATE 23505, not on the
-- constraint name, so the Polish duplicate message survives this rename unchanged.
alter table public.buildings
  drop constraint buildings_name_city_street_key;

-- A unique *index* rather than a constraint, because a constraint cannot be defined over
-- expressions. Same enforcement, same 23505 on violation.
create unique index buildings_name_city_street_lower_key
  on public.buildings (lower(name), lower(city), lower(street));

comment on index public.buildings_name_city_street_lower_key is
  'Case-insensitive uniqueness for a building. Catches an accidental double submit and a
   re-entry that differs only in capitalisation, without forbidding two genuinely
   different buildings that share a name in different towns.';

commit;
