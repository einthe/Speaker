export type NotificationTarget = "post" | "event" | "fine" | "volunteer_points" | null;
export function notificationPath(kind: NotificationTarget, id: string | null) {
  if (kind === "fine") return "/fines";
  if (kind === "volunteer_points") return "/volunteer_work_points";
  if ((kind === "post" || kind === "event") && id && /^[0-9a-f-]{36}$/i.test(id))
    return `/${kind === "post" ? "posts" : "schedule"}/${id}`;
  if (kind === "event" && !id) return "/schedule";
  return "/feed";
}
