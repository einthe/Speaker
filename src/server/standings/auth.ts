import "server-only";
import { z } from "zod";
import { StandingsError } from "./config";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive(),
});
let cached: { token: string; expiresAt: number } | undefined;
let pending: Promise<string> | undefined;

export function forgetToken(token: string) {
  if (cached?.token === token) cached = undefined;
}

export async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  if (pending) return pending;
  pending = requestToken();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}

async function requestToken(): Promise<string> {
  const clientId = process.env.NIF_CLIENT_ID;
  const secret = process.env.NIF_CLIENT_SECRET;
  if (!clientId || !secret) throw new StandingsError();
  try {
    const basic = Buffer.from(
      `${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`,
    ).toString("base64");
    const response = await fetch("https://id.nif.no/connect/token", {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: process.env.NIF_SCOPE || "data_ta_read",
      }),
    });
    if (!response.ok) throw new StandingsError();
    const data = tokenSchema.parse(await response.json());
    cached = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000 - Math.min(60_000, data.expires_in * 100),
    };
    return cached.token;
  } catch {
    throw new StandingsError();
  }
}
