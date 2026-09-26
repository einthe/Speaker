import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("demo launcher isolation", () => {
  it.each([{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL: "1" }] as const)(
    "refuses deployed environments %j before starting a database",
    (environment) => {
      const result = spawnSync(process.execPath, ["scripts/demo.mjs"], {
        env: { ...process.env, ...environment },
        encoding: "utf8",
        timeout: 10000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("The demo is local only");
      expect(result.stdout).not.toContain("Preparing fictional demo data");
    },
  );

  it("refuses binding demo accounts to a public interface", () => {
    const result = spawnSync(process.execPath, ["scripts/demo.mjs", "--hostname", "0.0.0.0"], {
      env: { ...process.env, NODE_ENV: "development", VERCEL: "" },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must bind to localhost or 127.0.0.1");
    expect(result.stdout).not.toContain("Preparing fictional demo data");
  });
});
