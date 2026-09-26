import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { Player, Post, TeamEvent, Lineup, Notification } from "@/lib/domain";
import type {
  Access,
  AdminUsers,
  NotificationSettings,
  PostList,
  Change,
  ImageSettings,
} from "./contract";
import type { VolunteerWorkPoints } from "@/lib/volunteer-work-points";
import type { Standings } from "@/lib/standings";
import type { Fines } from "@/lib/fines";

export class AccessChanged extends Error {
  constructor(public destination: string) {
    super("Tilgangen er endret.");
  }
}
export const cacheTimes = {
  session: 15_000,
  posts: 30_000,
  events: 60_000,
  roster: 300_000,
  volunteerWorkPoints: 60_000,
  standings: 5 * 60_000,
  lineups: 30_000,
  notifications: 15_000,
  admin: 15_000,
  rules: 60_000,
};
export const keys = {
  all: (scope: string) => ["team", scope] as const,
  session: (scope: string) => ["team", scope, "session"] as const,
  posts: (scope: string) => ["team", scope, "posts"] as const,
  post: (scope: string, id: string) => ["team", scope, "post", id] as const,
  events: (scope: string) => ["team", scope, "events"] as const,
  event: (scope: string, id: string) => ["team", scope, "event", id] as const,
  roster: (scope: string) => ["team", scope, "roster"] as const,
  volunteerWorkPoints: (scope: string) => ["team", scope, "volunteer_work_points"] as const,
  fines: (scope: string) => ["team", scope, "fines"] as const,
  standings: (scope: string) => ["team", scope, "standings"] as const,
  lineups: (scope: string) => ["team", scope, "lineups"] as const,
  notifications: (scope: string) => ["team", scope, "notifications"] as const,
  users: (scope: string) => ["team", scope, "users"] as const,
  rules: (scope: string) => ["team", scope, "rules"] as const,
  imageSettings: (scope: string) => ["team", scope, "image-settings"] as const,
};
async function read<T>(
  scope: string,
  resource: string,
  signal: AbortSignal,
  params: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`/api/team/${resource}?${new URLSearchParams(params)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { "X-Team-Scope": scope },
  });
  const result = await response.json();
  if ([401, 403, 409].includes(response.status))
    throw new AccessChanged(result.destination ?? "/auth/sign-in");
  if (!response.ok) throw new Error(result.error ?? "Kunne ikke hente innholdet.");
  return result.data as T;
}
export const queries = {
  fines: (scope: string) =>
    queryOptions({
      queryKey: keys.fines(scope),
      queryFn: ({ signal }) => read<Fines>(scope, "fines", signal),
      staleTime: 30_000,
    }),
  discussion: (scope: string, target: import("@/lib/discussions").DiscussionTarget) =>
    queryOptions({
      queryKey: [...keys.all(scope), "discussion", target.target_type, target.target_id],
      queryFn: ({ signal }) =>
        read<import("@/lib/discussions").DiscussionData>(scope, "discussion", signal, target),
      staleTime: 15_000,
      refetchInterval: 30_000,
    }),
  volunteerWorkPoints: (scope: string) =>
    queryOptions({
      queryKey: keys.volunteerWorkPoints(scope),
      queryFn: ({ signal }) => read<VolunteerWorkPoints[]>(scope, "volunteer_work_points", signal),
      staleTime: cacheTimes.volunteerWorkPoints,
    }),
  standings: (scope: string) =>
    queryOptions({
      queryKey: keys.standings(scope),
      queryFn: ({ signal }) => read<Standings>(scope, "standings", signal),
      staleTime: cacheTimes.standings,
      refetchInterval: cacheTimes.standings,
    }),
  session: (scope: string) =>
    queryOptions({
      queryKey: keys.session(scope),
      queryFn: ({ signal }) => read<Access>(scope, "session", signal),
      staleTime: cacheTimes.session,
    }),
  posts: (scope: string, page = 1, filter = "") =>
    queryOptions({
      queryKey: [...keys.posts(scope), { page, filter }],
      queryFn: ({ signal }) =>
        read<PostList>(scope, "posts", signal, { page: String(page), filter }),
      staleTime: cacheTimes.posts,
    }),
  post: (scope: string, id: string, client: QueryClient) =>
    queryOptions<Post | null>({
      queryKey: keys.post(scope, id),
      queryFn: ({ signal }) => read<Post | null>(scope, "post", signal, { id }),
      staleTime: cacheTimes.posts,
      // List and detail use the same complete record shape. Seed it as stale so
      // a canonical read runs, while a failed refresh can retain useful content.
      initialDataUpdatedAt: 0,
      initialData: () =>
        client
          .getQueriesData<PostList>({ queryKey: keys.posts(scope) })
          .flatMap(([, data]) => data?.posts ?? [])
          .find((p) => p.id === id),
    }),
  events: (scope: string, past = false, kind = "", page = 1) =>
    queryOptions({
      queryKey: [...keys.events(scope), { past, kind, page }],
      queryFn: ({ signal }) =>
        read<{ events: TeamEvent[]; count: number }>(scope, "events", signal, {
          history: past ? "1" : "0",
          kind,
          page: String(page),
        }),
      staleTime: cacheTimes.events,
      refetchInterval: 5 * 60_000,
    }),
  event: (scope: string, id: string, client: QueryClient) =>
    queryOptions<TeamEvent | null>({
      queryKey: keys.event(scope, id),
      queryFn: ({ signal }) => read<TeamEvent | null>(scope, "event", signal, { id }),
      staleTime: cacheTimes.events,
      initialDataUpdatedAt: 0,
      initialData: () =>
        client
          .getQueriesData<{ events: TeamEvent[] }>({ queryKey: keys.events(scope) })
          .flatMap(([, data]) => data?.events ?? [])
          .find((e) => e.id === id),
    }),
  roster: (scope: string) =>
    queryOptions({
      queryKey: keys.roster(scope),
      queryFn: ({ signal }) => read<Player[]>(scope, "roster", signal),
      staleTime: cacheTimes.roster,
    }),
  lineup: (scope: string, id: string, by: "match" | "id" = "match") =>
    queryOptions({
      queryKey: [...keys.lineups(scope), by, id],
      queryFn: ({ signal }) => read<Lineup | null>(scope, "lineup", signal, { id, by }),
      staleTime: cacheTimes.lineups,
      enabled: !!id,
    }),
  notifications: (scope: string) =>
    queryOptions({
      queryKey: keys.notifications(scope),
      queryFn: ({ signal }) => read<Notification[]>(scope, "notifications", signal),
      staleTime: cacheTimes.notifications,
    }),
  users: (scope: string) =>
    queryOptions({
      queryKey: keys.users(scope),
      queryFn: ({ signal }) => read<AdminUsers>(scope, "users", signal),
      staleTime: cacheTimes.admin,
    }),
  imageSettings: (scope: string) =>
    queryOptions({
      queryKey: keys.imageSettings(scope),
      queryFn: ({ signal }) => read<ImageSettings>(scope, "image-settings", signal),
      staleTime: cacheTimes.admin,
    }),
  rules: (scope: string) =>
    queryOptions({
      queryKey: keys.rules(scope),
      queryFn: ({ signal }) => read<NotificationSettings>(scope, "rules", signal),
      staleTime: cacheTimes.rules,
    }),
};

export async function invalidateChange(client: QueryClient, scope: string, change: Change) {
  if (typeof window !== "undefined") {
    if (change.kind === "remove-media" && change.id)
      window.dispatchEvent(
        new CustomEvent("team:invalidate-image", { detail: `/media/${change.id}` }),
      );
    if (change.kind === "profile-photo" || change.kind === "remove-profile-photo") {
      const access = client.getQueryData<Access>(keys.session(scope));
      if (access)
        window.dispatchEvent(
          new CustomEvent("team:invalidate-image", { detail: `/avatars/${access.profile.id}` }),
        );
    }
  }
  const targets: (readonly unknown[])[] = [];
  const add = (...values: (readonly unknown[])[]) => targets.push(...values);
  switch (change.kind) {
    case "fine-multiplier":
    case "fine-type":
    case "fine-rules":
    case "fine":
    case "cancel-fine":
      add(keys.fines(scope));
      break;
    case "image-settings":
      add(keys.imageSettings(scope), keys.session(scope));
      break;
    case "profile-photo":
    case "remove-profile-photo":
      add(
        keys.session(scope),
        keys.roster(scope),
        keys.posts(scope),
        ["team", scope, "post"],
        [...keys.all(scope), "discussion"],
      );
      break;
    case "post":
    case "delete-post":
    case "remove-media":
      add(keys.posts(scope));
      if (change.postId) add(keys.post(scope, change.postId));
      if (change.kind === "delete-post" && change.postId) {
        client.removeQueries({ queryKey: keys.post(scope, change.postId) });
        client.setQueriesData<PostList>(
          { queryKey: keys.posts(scope) },
          (data) =>
            data && {
              ...data,
              posts: data.posts.filter((p) => p.id !== change.postId),
              count: Math.max(
                0,
                data.count - (data.posts.some((p) => p.id === change.postId) ? 1 : 0),
              ),
            },
        );
      }
      break;
    case "event":
    case "delete-event":
      add(keys.events(scope), keys.lineups(scope));
      if (change.id) add(keys.event(scope, change.id));
      if (change.kind === "delete-event" && change.id)
        client.removeQueries({ queryKey: keys.event(scope, change.id) });
      break;
    case "lineup":
      add(keys.lineups(scope), keys.posts(scope));
      await client.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "team" &&
          q.queryKey[1] === scope &&
          q.queryKey[2] === "post" &&
          !!(q.state.data as Post | undefined)?.lineup_id,
      });
      break;
    case "volunteer_work_points":
      add(keys.volunteerWorkPoints(scope));
      break;
    case "user":
      add(keys.fines(scope));
      add(keys.volunteerWorkPoints(scope));
    case "positions":
      add(keys.roster(scope), keys.users(scope));
      break;
    case "notification-rule":
    case "notification-rules":
    case "test-notification-email":
      add(keys.rules(scope));
      break;
    case "read-notification":
    case "read-all-notifications":
      client.setQueryData<Notification[]>(keys.notifications(scope), (data) =>
        data?.map((n) =>
          !n.read_at && (change.kind === "read-all-notifications" || n.id === change.id)
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );
      add(keys.notifications(scope));
      break;
  }
  await Promise.all(targets.map((queryKey) => client.invalidateQueries({ queryKey })));
  // An edited/created entity is canonical before navigating to its detail screen.
  if (change.kind === "post" && change.postId)
    await client.fetchQuery(queries.post(scope, change.postId, client));
  if (change.kind === "event" && change.id)
    await client.fetchQuery(queries.event(scope, change.id, client));
}
