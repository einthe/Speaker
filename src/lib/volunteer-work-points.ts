import { z } from "zod";
import { uuid } from "./domain";

export type VolunteerWorkPoints = {
  id: string;
  full_name: string;
  points: number;
  version: number;
};

export const volunteerWorkPointsSchema = z.object({
  id: uuid,
  points: z.number().int().min(0).max(2147483647),
  expected_version: z.number().int().min(0),
});
