import { startLocalBackend } from "../tests/fixtures/backend.mjs";
import { seedDemo } from "./demo-seed.mjs";
const backend = await startLocalBackend({ port: 54329, seed: seedDemo });
console.log(`Speaker test backend: ${backend.url}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await backend.close();
    process.exit(0);
  });
