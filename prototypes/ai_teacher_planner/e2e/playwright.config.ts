import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Never 4319: a real planner may be running there.
const PORT = 4320;

const testDir = defineBddConfig({
  features: "../features/*.feature",
  featuresRoot: "..",
  steps: ["steps/*.ts", "support/fixtures.ts"],
  // Scenarios whose browser steps come in a later task carry @e2e-later.
  tags: "@e2e and not @e2e-later",
  outputDir: ".features-gen",
});

export default defineConfig({
  testDir,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node support/server.ts",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
});
