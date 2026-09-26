import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
import {
  deliverNotificationEmails,
  emailConfiguration,
  emailPayload,
  type EmailJob,
} from "@/server/notifications/email";
import { GET } from "@/app/api/cron/notifications/route";
import { testNotificationSample } from "@/lib/test-notifications";
import { notificationTriggers } from "@/lib/domain";
const job: EmailJob = {
  id: "00000000-0000-4000-a000-000000000001",
  lease_id: "lease",
  recipient_email: "member@example.test",
  title: "<img src=x onerror=alert(1)>\nTitle",
  body: "A & B <script>alert(1)</script>",
  target_type: "post",
  target_id: "00000000-0000-4000-a000-000000000002",
};
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "resend");
  vi.stubEnv("RESEND_API_KEY", "fake-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Team <team@example.test>");
  vi.stubEnv("SUPABASE_SECRET_KEY", "fake-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://team.example.test");
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  rpc.mockReset();
  let claimed = false;
  rpc.mockImplementation(async (name, args) => {
    if (name === "claim_notification_emails") {
      if (claimed) return { data: [], error: null };
      claimed = true;
      return { data: [job], error: null };
    }
    if (name === "prepare_notification_email") return { data: args.data.payload, error: null };
    return { data: null, error: null };
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "resend-id" })));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("renders simulated notification types with working section links and the normal email template", () => {
  for (const trigger of Object.keys(
    notificationTriggers,
  ) as (keyof typeof notificationTriggers)[]) {
    const sample = testNotificationSample(trigger);
    const payload = emailPayload(
      {
        ...job,
        ...sample,
        title: `[TEST] ${sample.title}`,
        target_id: null,
      },
      "Team <team@example.test>",
      "https://team.example.test",
    );
    expect(payload.subject).toContain("[TEST]");
    const section = {
      post: "/feed",
      event: "/schedule",
      fine: "/fines",
      volunteer_points: "/volunteer_work_points",
    }[sample.target_type!];
    expect(payload.html).toContain(`href="https://team.example.test${section}"`);
    expect(payload.to).toEqual([job.recipient_email]);
  }
});
it("escapes user content and uses only the configured site for links", () => {
  const payload = emailPayload(
    job,
    "Team <team@example.test>",
    "https://team.example.test/some/path",
  );
  expect(payload.to).toEqual([job.recipient_email]);
  expect(payload.html).not.toContain("<script>");
  expect(payload.html).toContain("&lt;script&gt;");
  expect(payload.html).toContain(`https://team.example.test/posts/${job.target_id}`);
  expect(payload.subject).not.toMatch(/[\r\n]/);
  expect(
    emailPayload({ ...job, target_type: "fine" }, "Team", "https://team.example.test").text,
  ).toContain("https://team.example.test/fines");
  expect(
    emailPayload({ ...job, target_type: "volunteer_points" }, "Team", "https://team.example.test")
      .text,
  ).toContain("https://team.example.test/volunteer_work_points");
});
it("requires explicit configuration, blocks production previews, and previews locally without external requests", async () => {
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "disabled");
  expect(await deliverNotificationEmails()).toEqual({ status: "disabled", processed: 0 });
  expect(rpc).not.toHaveBeenCalled();
  vi.stubEnv("NOTIFICATION_EMAIL_MODE", "preview");
  expect(emailConfiguration().configured).toBe(false);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3101");
  expect(await deliverNotificationEmails()).toEqual({ status: "processed", processed: 1 });
  expect(fetch).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("finish_notification_email", {
    data: expect.objectContaining({ status: "sent", provider_id: "local-preview" }),
  });
});
it("sends individually with a stable idempotency key and records accepted delivery", async () => {
  await deliverNotificationEmails();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "https://api.resend.com/emails",
    expect.objectContaining({
      headers: expect.objectContaining({
        "Idempotency-Key": `notification/${job.id}`,
        Authorization: "Bearer fake-key",
      }),
    }),
  );
  const payload = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(payload.to).toEqual([job.recipient_email]);
  expect(payload).not.toHaveProperty("cc");
  expect(rpc).toHaveBeenCalledWith("finish_notification_email", {
    data: expect.objectContaining({
      id: job.id,
      lease_id: job.lease_id,
      status: "sent",
      provider_id: "resend-id",
    }),
  });
});
it.each([429, 500, 401, 403, 409])(
  "retries provider HTTP %s without claiming successful delivery",
  async (status) => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ message: "private provider response" }, { status }),
    );
    await deliverNotificationEmails();
    expect(rpc).toHaveBeenCalledWith("finish_notification_email", {
      data: expect.objectContaining({ status: "pending", error: `provider_http_${status}` }),
    });
  },
);
it("retains uncertain deliveries for safe retry and records permanent rejections", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("Network"));
  await deliverNotificationEmails();
  expect(rpc).toHaveBeenCalledWith("finish_notification_email", {
    data: expect.objectContaining({ status: "pending", error: "provider_unreachable" }),
  });
});
it("requires the cron secret and prevents caching", async () => {
  expect((await GET(new Request("https://team.example.test/api/cron/notifications"))).status).toBe(
    401,
  );
  expect(fetch).not.toHaveBeenCalled();
  const response = await GET(
    new Request("https://team.example.test/api/cron/notifications", {
      headers: { Authorization: "Bearer test-cron-secret" },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
