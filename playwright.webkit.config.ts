import { defineConfig, devices } from "@playwright/test";
import local from "./playwright.local.config";

export default defineConfig({
  ...local,
  testMatch:
    /(?:session-images|image-loading|private-images|image-settings|profile|comment-avatars|responsive-tabs)\.spec\.ts/,
  projects: [{ name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" } }],
});
