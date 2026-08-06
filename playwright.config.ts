import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the real local stack: Supabase from `npx supabase start` and the app
 * on the Cloudflare workerd runtime from `npm run dev`. Both boundaries stay real on
 * purpose -- the risks these tests exist to protect (test plan §2) live in the crossings
 * between auth, routing, the API and the database, so a mock at any of them would leave
 * the test asserting nothing that could fail in production.
 *
 * The administrator account these tests sign in as comes from `supabase/seed.sql`, which
 * runs on `npx supabase db reset`. It exists in the LOCAL database only.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4321";

/** Written by the `setup` project, read by every test. Never committed -- see .gitignore. */
export const STORAGE_STATE = "playwright/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",

  // Parallel by default, because test independence is a rule here rather than a
  // preference: a test that leans on another test's leftovers fails on this machine
  // instead of failing randomly in CI.
  fullyParallel: true,

  // No retries, anywhere. A test that passes on the second attempt is a test whose
  // result carries no information -- and retries would hide exactly the shared-state
  // and timing defects this suite is written to keep out.
  retries: 0,

  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [
    // Signs in once and stores the session; everything below depends on it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
