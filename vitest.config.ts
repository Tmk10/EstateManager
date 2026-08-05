import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// NOT `getViteConfig()` from `astro/config`, which is what Astro's testing guide
// recommends and what `context/foundation/test-plan.md` §4 was written against.
// It cannot be used here: it loads astro.config.mjs, which registers the
// Cloudflare adapter's Vite plugin, and that plugin rejects the `resolve.external`
// list Vitest sets on the `ssr` environment — the run dies at startup before a
// single test is collected. Passing `{ adapter: undefined }` as the second
// argument does not help, because Astro's inline config merges over the file
// config rather than unsetting keys in it.
//
// What is given up: nothing the current suite needs. `getViteConfig()` buys
// Astro-aware module resolution, and the modules §3 Phase 1 targets — `shares.ts`
// and `units-csv.ts` — are dependency-free by design so they can also be executed
// under bare node. Revisit this when §3 Phase 3 lands: an integration test that
// has to render an Astro component will need the Astro pipeline back, and the
// answer then is most likely a second Vitest project rather than a retry of this.
//
// `vite-tsconfig-paths` reads `@/*` straight out of tsconfig.json rather than
// restating it, so the alias cannot drift from the one the app builds against.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Astro 6 no longer renders Astro components in Vitest's client
    // environments, and §7 of the test plan excludes UI testing outright, so
    // nothing here needs a DOM.
    environment: "node",
    // Unit tests live beside the module they exercise. The database contract
    // suite is not Vitest's — it is pgTAP under `supabase/tests/`, run by
    // `npm run test:db`.
    include: ["src/**/*.test.ts"],
  },
});
