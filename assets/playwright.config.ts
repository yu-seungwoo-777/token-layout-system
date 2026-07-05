import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Run against the production build, not `next dev`. Dev skips
    // tree-shaking, RSC serialization, and dynamic-import resolution —
    // all failure modes that only surface once you ship. verify.sh
    // builds before this server starts, so `next start` serves the same
    // artifact your users will. See verify.sh for the full rationale.
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
