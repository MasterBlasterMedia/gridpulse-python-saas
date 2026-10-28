import { defineConfig, devices } from "@playwright/test";

// Hosted acceptance checks allow free-tier wakeups; local CI keeps its tighter budget.
// These tests verify behavior, not an application latency service-level objective.
const hosted = process.env.E2E_BASE_URL?.startsWith("https://") ?? false;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: hosted ? 120000 : 30000,
  expect: { timeout: hosted ? 90000 : 5000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
