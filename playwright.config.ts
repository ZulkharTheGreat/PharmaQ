import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 10000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright-report", open: "never" }],
  ],
  use: {
    channel: "chromium",
    actionTimeout: 10000,
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "artifacts/test-results",
  webServer: {
    env: { PORT: "3100" },
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
