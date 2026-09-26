import { z } from "zod";
import { uuid, type Profile, type SecondaryRole } from "./domain";

export const canManageFines = (profile: Profile, roles: SecondaryRole[]) =>
  profile.account_status === "approved" &&
  (profile.base_role === "admin" ||
    (profile.base_role === "player" && roles.includes("fine_manager")));

export type FineType = {
  id: string;
  name: string;
  description: string;
  amount_ore: number;
  active: boolean;
  version: number;
};
export type Fine = {
  id: string;
  type_name_snapshot: string;
  amount_ore: number;
  base_amount_ore: number;
  multiplier_name_snapshot: string;
  multiplier_factor_snapshot: number;
  note: string;
  issued_by_name_snapshot: string;
  created_at: string;
  cancelled_at: string | null;
};
export type FineMember = {
  id: string;
  full_name: string;
  base_role: "player" | "coach";
  total_ore: number;
  fines: Fine[];
};
export type Fines = {
  members: FineMember[];
  types: FineType[];
  multipliers: FineMultiplier[];
  rules: { body: string; version: number };
};
export type FineMultiplier = Omit<FineType, "amount_ore"> & { factor: number };
export const multiplierFactorSchema = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^\d+([.,]\d{1,2})?$/, "Skriv en multiplikator med høyst to desimaler.")
      .transform((value) => Number(value.replace(",", "."))),
  ])
  .pipe(
    z
      .number()
      .min(0.01)
      .max(100)
      .refine((value) => value === Number(value.toFixed(2)), "Bruk høyst to desimaler."),
  );
export const factorLabel = (factor: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(factor);
export const multipliedAmount = (ore: number, factor: number) =>
  Math.floor((ore * Math.round(factor * 100) + 50) / 100);
export const fineMultiplierSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000),
  factor: multiplierFactorSchema,
  active: z.boolean(),
  expected_version: z.coerce.number().int().min(0),
});
export const nok = (ore: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(ore / 100);
export const nokInput = (ore: number) => String(ore / 100).replace(".", ",");
export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, "Skriv et beløp i kroner med høyst to desimaler.")
  .transform((value) => {
    const [whole, fraction = ""] = value.replace(",", ".").split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().int().min(1).max(100000000));
export const fineTypeSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000),
  amount_ore: amountSchema,
  active: z.boolean(),
  expected_version: z.coerce.number().int().min(0),
});
export const fineRulesSchema = z.object({
  body: z.string().trim().max(10000),
  expected_version: z.coerce.number().int().min(0),
});
export const applyFineSchema = z.object({
  id: uuid,
  user_id: uuid,
  fine_type_id: uuid,
  expected_type_version: z.coerce.number().int().min(0),
  multiplier_id: uuid.optional(),
  expected_multiplier_version: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(1000),
});
