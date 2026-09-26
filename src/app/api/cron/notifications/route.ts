import { timingSafeEqual } from "node:crypto";
import { deliverNotificationEmails } from "@/server/notifications/email";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const headers = { "Cache-Control": "private, no-store" };
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await deliverNotificationEmails();
    return Response.json(result, { status: result.status === "disabled" ? 503 : 200, headers });
  } catch {
    return Response.json({ error: "Notification delivery unavailable" }, { status: 503, headers });
  }
}
export const POST = GET;
