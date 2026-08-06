import { execFileSync } from "node:child_process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

import type { Database } from "@/db/database.types";
import { createVotingToken } from "@/lib/voting-token";

/**
 * Direct database access for E2E cleanup, and for reading the few values the product
 * deliberately keeps out of the HTML (a voting token, for one).
 *
 * This is a `service_role` client and it bypasses RLS, so nothing in a test may use it to
 * *reach* the behaviour under test -- only to set a fixture up or to tear one down. A test
 * that asserts through this client asserts the database, not the application, and the
 * risks in `context/foundation/test-plan.md` §2 all live above the database.
 *
 * There is no delete path anywhere in the product ("bez edycji rejestru", PRD §Non-Goals),
 * which is why cleanup cannot go through the UI the way the lesson's example does.
 */

let cached: SupabaseClient<Database> | null = null;

/** Reads the local stack's own values rather than a checked-in copy that could drift. */
function localStackEnv(): { url: string; key: string; dbUrl: string } {
  const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  const read = (name: string): string => {
    const match = new RegExp(`^${name}="?([^"\n]+)"?$`, "m").exec(output);
    if (!match) {
      throw new Error(
        `${name} is missing from \`npx supabase status\`. Is the local stack up? See README §Supabase Configuration.`,
      );
    }
    return match[1];
  };

  return { url: read("API_URL"), key: read("SERVICE_ROLE_KEY"), dbUrl: read("DB_URL") };
}

/**
 * The direct `postgres` connection, used by `purgeBuilding` and by nothing else. Kept beside
 * the PostgREST values so both come from the running stack rather than from a copy on disk.
 */
export function databaseUrl(): string {
  return process.env.E2E_DB_URL ?? localStackEnv().dbUrl;
}

export function serviceClient(): SupabaseClient<Database> {
  if (cached) return cached;

  // CI passes these explicitly; locally we ask the running stack, so a developer never has
  // to keep a service key anywhere on disk.
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SERVICE_ROLE_KEY;
  const resolved = url && key ? { url, key } : localStackEnv();

  cached = createClient(resolved.url, resolved.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Creates the budynek a test needs to start from, and returns its id.
 *
 * Setup, never assertion: a test about the registry import should fail because the import
 * broke, not because building-create broke. That path has its own coverage in
 * `seed.spec.ts`, which drives it through the UI the way an administrator would.
 */
export async function createBuilding(name: string): Promise<string> {
  const { data, error } = await serviceClient()
    .from("buildings")
    .insert({ name, city: "Warszawa", street: "Kwiatowa 3" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Fixture failed to create building "${name}": ${error.message}`);
  }
  return data.id;
}

/**
 * Removes a building and everything hanging off it -- `units` and `owners` both cascade
 * from `buildings`, which is what makes one delete enough. Safe to call for a name that was
 * never created: a test whose action failed still has to clean up, and a cleanup that threw
 * would replace the real failure with its own.
 */
export async function deleteBuildingNamed(name: string): Promise<void> {
  const { error } = await serviceClient().from("buildings").delete().eq("name", name);
  if (error) {
    throw new Error(`Cleanup failed for building "${name}": ${error.message}`);
  }
}

/** Unique per test and readable in the database when something needs looking at by hand. */
export function uniqueBuildingName(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface VotingScenario {
  buildingId: string;
  /** Resolves. Its uchwała is `open`, so this is the one token here that renders a ballot. */
  openToken: string;
  /**
   * Stored, well-formed, and resolves to nothing: its uchwała never left `draft`, which
   * `resolve_voting_link` filters out. The whole point of the risk is that this is
   * indistinguishable from a token that was never issued at all.
   */
  draftToken: string;
  resolutionTitle: string;
  ownerFullName: string;
}

/**
 * A building with a registry, one `open` uchwała and one still in `draft`, plus a real
 * voting token for each.
 *
 * Ordering is forced by the schema and is not a style choice: both links are minted while
 * both uchwały are still drafts, because `EM012` refuses a NEW link for an uchwała that has
 * left draft -- adding a voter to a running vote. Only then is one of them opened.
 */
export async function createVotingScenario(name: string): Promise<VotingScenario> {
  const buildingId = await createBuilding(name);
  const db = serviceClient();

  // Unique per scenario: `owners` carries a partial unique index on the address, and two
  // workers running this fixture at once would otherwise collide on it.
  const slug = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  const ownerEmail = `anna-${slug}@example.com`;
  const ownerFullName = "Anna Nowak";

  // Through the RPC rather than by inserting rows: `import_building_units` is the only write
  // path into units/owners, and it is what keeps shares totalling 10000 bps (EM003) and
  // `buildings.total_area_m2` agreeing with the areas (EM004).
  const { error: importError } = await db.rpc("import_building_units", {
    p_building_id: buildingId,
    p_rows: [
      { unit_number: "1", area_m2: "50.00", share_bps: 5000, full_name: ownerFullName, email: ownerEmail },
      {
        unit_number: "2",
        area_m2: "50.00",
        share_bps: 5000,
        full_name: "Piotr Zieliński",
        email: `piotr-${slug}@example.com`,
      },
    ],
  });
  if (importError) {
    throw new Error(`Fixture failed to import a registry for "${name}": ${importError.message}`);
  }

  const { data: owner, error: ownerError } = await db
    .from("owners")
    .select("id")
    .eq("building_id", buildingId)
    .eq("email", ownerEmail)
    .single();
  if (ownerError) {
    throw new Error(`Fixture could not read back the owner for "${name}": ${ownerError.message}`);
  }

  const resolutionTitle = "Remont dachu i elewacji";
  const { data: resolutions, error: resolutionError } = await db
    .from("resolutions")
    .insert([
      {
        building_id: buildingId,
        number: "1/2026",
        title: resolutionTitle,
        body: "Treść uchwały poddanej pod głosowanie.",
      },
      {
        building_id: buildingId,
        number: "2/2026",
        title: "Plan gospodarczy",
        body: "Projekt uchwały, nadal w przygotowaniu.",
      },
    ])
    .select("id, number");
  if (resolutionError || resolutions.length !== 2) {
    throw new Error(
      `Fixture failed to create resolutions for "${name}": ${resolutionError?.message ?? "wrong row count"}`,
    );
  }

  const toOpen = resolutions.find((row) => row.number === "1/2026");
  const staysDraft = resolutions.find((row) => row.number === "2/2026");
  if (!toOpen || !staysDraft) {
    throw new Error(`Fixture could not identify the resolutions it just created for "${name}"`);
  }

  // Production's own generator, so these match `voting_links_token_format` and carry the
  // same 256 bits of entropy a real link does.
  const openToken = createVotingToken();
  const draftToken = createVotingToken();

  const { error: linkError } = await db.from("voting_links").insert([
    { building_id: buildingId, resolution_id: toOpen.id, owner_id: owner.id, token: openToken },
    { building_id: buildingId, resolution_id: staysDraft.id, owner_id: owner.id, token: draftToken },
  ]);
  if (linkError) {
    throw new Error(`Fixture failed to issue voting links for "${name}": ${linkError.message}`);
  }

  const { error: openError } = await db
    .from("resolutions")
    .update({ status: "open", opened_at: new Date().toISOString() })
    .eq("id", toOpen.id);
  if (openError) {
    throw new Error(`Fixture failed to open the resolution for "${name}": ${openError.message}`);
  }

  return { buildingId, openToken, draftToken, resolutionTitle, ownerFullName };
}

/**
 * Removes a building and everything under it, including an uchwała that has left `draft`.
 *
 * `deleteBuildingNamed` cannot do this and must not be changed to: once an uchwała is open,
 * `EM009` refuses to delete it (a cascade from the building fires the same trigger), `EM013`
 * refuses to delete its links, and `EM007` refuses to move it back to draft. That trio is
 * what closes the delete-then-reinsert route that would let someone re-cast another owner's
 * vote, and it is doing its job -- the product genuinely has no way to erase a live vote.
 *
 * So teardown steps outside the product, as the `postgres` superuser with triggers off. Two
 * rules come with that, and neither is negotiable:
 *
 *   1. This runs in `afterEach` and nowhere else. A test that used it to reach the behaviour
 *      under test would be asserting against a privilege the application does not have.
 *   2. `session_replication_role = replica` disables foreign-key triggers along with the
 *      domain's own, so nothing cascades. The deletes below are therefore explicit and
 *      ordered by dependency; dropping one would leave orphans rather than an error.
 */
export async function purgeBuilding(buildingId: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    await client.query("begin");
    // `local`, so it lasts exactly as long as this transaction.
    await client.query("set local session_replication_role = replica");

    for (const statement of [
      "delete from public.votes where resolution_id in (select id from public.resolutions where building_id = $1)",
      "delete from public.voting_links where building_id = $1",
      "delete from public.resolutions where building_id = $1",
      "delete from public.units where building_id = $1",
      "delete from public.owners where building_id = $1",
      "delete from public.buildings where id = $1",
    ]) {
      await client.query(statement, [buildingId]);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
