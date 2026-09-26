import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./tests/demo",
  workers: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:3101" },
  webServer: {
    command: "npm run dev -- --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_BUILD_DIR: ".next-demo-tests",
      NEXT_PUBLIC_GIPHY_API_KEY: "",
      // Deliberately unusable remote configuration: the launcher must override it.
      NEXT_PUBLIC_SUPABASE_URL: "https://invalid.example.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "not-a-real-key",
      NEXT_PUBLIC_SITE_URL: "https://invalid.example.test",
    },
  },
});
