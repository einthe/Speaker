import "server-only";
import { after } from "next/server";
import { deliverNotificationEmails, emailConfiguration } from "./email";

export function scheduleNotificationEmails() {
  if (!emailConfiguration().configured) return;
  after(async () => {
    try {
      await deliverNotificationEmails();
    } catch {
      console.error("Notification email delivery deferred; queued messages will be retried.");
    }
  });
}
