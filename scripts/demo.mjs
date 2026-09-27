import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startLocalBackend } from "../tests/fixtures/backend.mjs";
import { seedDemo, demoPassword } from "./demo-seed.mjs";

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  console.error("The demo is local only. Use npm run build and npm start for deployment.");
  process.exit(1);
}
const { values } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: process.env.PORT ?? "3000" },
    hostname: { type: "string", short: "H", default: "127.0.0.1" },
  },
});
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid demo port.");
if (!["localhost", "127.0.0.1"].includes(values.hostname)) {
  throw new Error("The demo must bind to localhost or 127.0.0.1.");
}
const origin = `http://${values.hostname}:${port}`;
console.log("Preparing local demo accounts…");
const serviceKey = randomUUID();
const backend = await startLocalBackend({ port: 0, serviceKey, seed: seedDemo });
console.log(`
NTNUI SPEAKER — LOCAL DEMO — ${origin}
Admin: admin@demo.test
User: user@demo.test
Password: ${demoPassword}
Match edits stay in the open tab and reset on reload.
`);
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
    "dev",
    "--hostname",
    values.hostname,
    "--port",
    String(port),
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_BUILD_DIR: process.env.NEXT_BUILD_DIR ?? ".next-demo",
      NEXT_PUBLIC_SUPABASE_URL: backend.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-demo-publishable-key",
      NEXT_PUBLIC_SITE_URL: origin,
      SPEAKER_DEMO: "1",
    },
  },
);
let stopping = false;
let killTimer;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
    killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    killTimer.unref();
  });
}
child.on("error", (error) => console.error(error.message));
child.on("close", async (code) => {
  clearTimeout(killTimer);
  await backend.close();
  process.exitCode = stopping ? 0 : (code ?? 1);
});
