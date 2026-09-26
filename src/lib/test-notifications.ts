import { z } from "zod";
import { notificationSchema, notificationTriggers, uuid } from "./domain";
import type { NotificationTarget } from "./notification-links";

export const testNotificationSchema = z.object({
  user_id: uuid,
  request_id: uuid,
  trigger_key: notificationSchema.shape.trigger_key,
});

export function testNotificationSample(trigger: keyof typeof notificationTriggers): {
  title: string;
  body: string;
  target_type: NotificationTarget;
} {
  const title = notificationTriggers[trigger];
  if (trigger === "fine_received")
    return {
      title: "Du har fått en bot",
      body: "For sent til trening · 50 kr",
      target_type: "fine",
    };
  if (trigger === "volunteer_points_changed")
    return {
      title: "Dugnadspoengene dine er oppdatert",
      body: "Du har nå 10 dugnadspoeng.",
      target_type: "volunteer_points",
    };
  if (trigger === "comment_reply_created")
    return { title: "Nytt svar på kommentaren din", body: "Eksempelspiller", target_type: "post" };
  if (trigger.endsWith("comment_created") || trigger.endsWith("reaction_created")) {
    const event = trigger.startsWith("event_");
    const reaction = trigger.endsWith("reaction_created");
    return {
      title: `${reaction ? "Ny reaksjon" : "Ny kommentar"}: ${event ? "Lagkveld" : "Informasjon til laget"}`,
      body: "Eksempelspiller",
      target_type: event ? "event" : "post",
    };
  }
  if (trigger === "lineup_published")
    return { title: "Ny kampoppstilling", body: "NTNUI D2A – Eksempellag", target_type: "post" };
  if (trigger.includes("post"))
    return {
      title,
      body: "Informasjon til laget: Husk lagmøtet etter neste trening.",
      target_type: "post",
    };
  return {
    title,
    body:
      trigger === "volunteer_assignment_created"
        ? "Du er satt opp på dugnad: Rigging til hjemmekamp."
        : "Eksempelhendelse: Lagaktivitet i hallen kl. 18:00.",
    target_type: "event",
  };
}
