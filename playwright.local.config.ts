import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", actionTimeout: 15000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      command: "npm run dev:manual -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/matches",
      reuseExistingServer: false,
      timeout: 120000,
      env: { SPEAKER_DEMO: "1", NEXT_BUILD_DIR: ".next-local-tests" },
    },
    {
      command: "npm run dev:manual -- --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/matches",
      reuseExistingServer: false,
      timeout: 120000,
      env: { SPEAKER_DEMO: "0", NEXT_BUILD_DIR: ".next-manual-tests" },
    },
  ],
});
