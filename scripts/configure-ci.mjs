import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const status = JSON.parse(readFileSync("/tmp/supabase-status.json", "utf8"));
const url = status.API_URL;
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const privileged = status.SERVICE_ROLE_KEY;
if (!url || !key || !privileged) throw new Error("Local Supabase credentials missing");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000\n`,
);
appendFileSync(
  process.env.GITHUB_ENV,
  `E2E_SUPABASE_URL=${url}\nE2E_SUPABASE_SERVICE_ROLE_KEY=${privileged}\n`,
);
