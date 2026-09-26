import "server-only";
import { createClient } from "@supabase/supabase-js";
import { notificationPath, type NotificationTarget } from "@/lib/notification-links";

export function emailConfiguration() {
  const mode = process.env.NOTIFICATION_EMAIL_MODE ?? "disabled";
  const preview =
    mode === "preview" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  const missing = [
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SITE_URL",
    ...(!preview ? ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] : []),
  ].filter((key) => !process.env[key]?.trim());
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    if (
      url.protocol !== "https:" &&
      !(preview && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    )
      missing.push("NEXT_PUBLIC_SITE_URL (HTTPS)");
    if (url.username || url.password) missing.push("NEXT_PUBLIC_SITE_URL (origin)");
  } catch {
    if (!missing.includes("NEXT_PUBLIC_SITE_URL")) missing.push("NEXT_PUBLIC_SITE_URL");
  }
  return {
    mode: preview
      ? ("preview" as const)
      : mode === "resend"
        ? ("resend" as const)
        : ("disabled" as const),
    configured: (preview || mode === "resend") && missing.length === 0,
    missing,
  };
}
export type EmailJob = {
  id: string;
  lease_id: string;
  recipient_email: string;
  title: string;
  body: string;
  target_type: NotificationTarget;
  target_id: string | null;
};
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function emailPayload(job: EmailJob, from: string, site: string) {
  const url = new URL(notificationPath(job.target_type, job.target_id), new URL(site).origin).href;
  return {
    from,
    to: [job.recipient_email],
    subject: `NTNUI D2A · ${job.title.replace(/[\r\n]/g, " ").slice(0, 180)}`,
    text: `${job.title}\n\n${job.body}\n\nÅpne lagrommet: ${url}\n\nDu mottar dette varselet som medlem av NTNUI D2A. Lagets administrator styrer varselinnstillingene.`,
    html: `<html lang="nb"><body><h1>${escapeHtml(job.title)}</h1><p>${escapeHtml(job.body)}</p><p><a href="${escapeHtml(url)}">Åpne lagrommet</a></p><p>Du mottar dette varselet som medlem av NTNUI D2A. Lagets administrator styrer varselinnstillingene.</p></body></html>`,
  };
}

export async function deliverNotificationEmails() {
  const config = emailConfiguration();
  if (!config.configured) return { status: "disabled" as const, processed: 0 };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000) }),
    },
  });
  const rpc = async <T>(name: string, data: Record<string, unknown>): Promise<T> => {
    const result = await db.rpc(name, { data });
    if (result.error) throw new Error("Notification queue unavailable");
    return result.data as T;
  };
  const deadline = Date.now() + 20_000;
  let processed = 0;
  while (Date.now() < deadline && processed < 50) {
    const jobs = await rpc<EmailJob[]>("claim_notification_emails", { limit: 1 });
    if (!jobs.length) break;
    const job = jobs[0];
    const identity = { id: job.id, lease_id: job.lease_id };
    const payload = await rpc<ReturnType<typeof emailPayload> | null>(
      "prepare_notification_email",
      {
        ...identity,
        payload: emailPayload(
          job,
          process.env.RESEND_FROM_EMAIL ?? "NTNUI D2A <demo@example.test>",
          process.env.NEXT_PUBLIC_SITE_URL!,
        ),
      },
    );
    if (!payload) {
      await rpc("finish_notification_email", {
        ...identity,
        status: "cancelled",
        error: "rule_or_recipient_changed",
      });
      continue;
    }
    let result: { status: string; provider_id?: string; error?: string };
    if (config.mode === "preview") result = { status: "sent", provider_id: "local-preview" };
    else {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "User-Agent": "ntnui-d2a/1.0",
            "Idempotency-Key": `notification/${job.id}`,
          },
          body: JSON.stringify(payload),
        });
        if (response.ok) {
          const body = await response.json();
          result =
            typeof body.id === "string"
              ? { status: "sent", provider_id: body.id }
              : { status: "pending", error: "invalid_provider_response" };
        } else {
          const retry =
            response.status === 429 ||
            response.status === 409 ||
            response.status >= 500 ||
            response.status === 401 ||
            response.status === 403;
          result = {
            status: retry ? "pending" : "failed",
            error: `provider_http_${response.status}`,
          };
        }
      } catch {
        result = { status: "pending", error: "provider_unreachable" };
      }
    }
    await rpc("finish_notification_email", { ...identity, ...result });
    processed++;
    if (result.status === "pending") break;
    if (config.mode !== "preview") await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { status: "processed" as const, processed };
}
