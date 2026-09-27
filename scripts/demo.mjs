import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

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
console.log(`
NTNUI SPEAKER — LOCAL DEMO — ${origin}
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
child.on("close", (code) => {
  clearTimeout(killTimer);
  process.exitCode = stopping ? 0 : (code ?? 1);
});
