import { expect, it } from "vitest";
import { dateLabel, toUTC } from "@/lib/dates";
it("uses Oslo daylight saving rules independently of server timezone", () => {
  expect(dateLabel("2026-10-03T13:00:00Z", "HH:mm")).toBe("15:00");
  expect(toUTC("2026-12-03T15:00")).toBe("2026-12-03T14:00:00.000Z");
  expect(() => toUTC("2026-03-29T02:30")).toThrow();
});
