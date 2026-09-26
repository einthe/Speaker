import { expect, it } from "vitest";
import {
  amountSchema,
  canManageFines,
  nok,
  nokInput,
  multiplierFactorSchema,
  multipliedAmount,
} from "@/lib/fines";
import type { Profile } from "@/lib/domain";
it("parses NOK exactly as integer øre", () => {
  expect(amountSchema.parse("0,29")).toBe(29);
  expect(amountSchema.parse("120.5")).toBe(12050);
  expect(amountSchema.parse("50")).toBe(5000);
  expect(nok(5000)).toMatch(/^50\s+kr$/);
  expect(nok(0)).toMatch(/^0\s+kr$/);
  expect(nokInput(5000)).toBe("50");
  expect(nok(5025)).toContain("50,25");
  for (const amount of ["-1", "0", "12.345", "1e4", "1000000.01", "NaN", ""])
    expect(amountSchema.safeParse(amount).success).toBe(false);
});
it("grants fine management only to approved admins and players with the fine_manager role", () => {
  const profile = { base_role: "player", account_status: "approved" } as Profile;
  expect(canManageFines(profile, ["fine_manager"])).toBe(true);
  expect(canManageFines(profile, ["financial_manager"])).toBe(false);
  expect(canManageFines({ ...profile, base_role: "coach" }, [])).toBe(false);
  expect(canManageFines({ ...profile, base_role: "admin" }, [])).toBe(true);
  expect(canManageFines({ ...profile, account_status: "disabled" }, ["fine_manager"])).toBe(false);
});

it("accepts decimal point/comma multipliers and rounds amounts to the nearest øre", () => {
  for (const value of ["1,5", "1.5", 1.5]) expect(multiplierFactorSchema.parse(value)).toBe(1.5);
  expect(multiplierFactorSchema.parse("0,5")).toBe(0.5);
  for (const value of ["", "1.234", 1.234, "NaN", "Infinity", 0, -1, 101])
    expect(multiplierFactorSchema.safeParse(value).success).toBe(false);
  expect(multipliedAmount(2500, 1.5)).toBe(3750);
  expect(multipliedAmount(1, 1.5)).toBe(2);
  expect(multipliedAmount(50, 1.13)).toBe(57);
});
