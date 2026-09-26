import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// No production code has a test bypass. A second Next server talks to this
// loopback-only fixture via the same Supabase SDK and Server Actions as production.
process.env.E2E_BASE_URL = "http://127.0.0.1:3100";
process.env.E2E_SUPABASE_URL = "http://127.0.0.1:54329";
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = "local-test-service-key-never-use-in-production";
process.env.E2E_LOCAL_ADAPTER = "1";
process.env.E2E_REQUIRE_BACKEND = "1";
export default defineConfig({
  ...base,
  workers: 1,
  use: {
    ...base.use,
    baseURL: process.env.E2E_BASE_URL,
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  webServer: [
    {
      command: "node tests/fixtures/backend.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
    },
    {
      command:
        process.env.E2E_NEXT_DEV === "1"
          ? "npm run dev:connected -- --hostname 127.0.0.1 --port 3100"
          : "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NOTIFICATION_EMAIL_MODE: "disabled",
        RESEND_API_KEY: "",
        NEXT_BUILD_DIR: ".next-local-tests",
        NEXT_PUBLIC_GIPHY_API_KEY: "local-test-giphy-key-not-real",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-publishable-key",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      },
    },
  ],
});
