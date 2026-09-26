import "server-only";
import type { VolunteerWorkPoints } from "@/lib/volunteer-work-points";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, isConfigured } from "@/lib/supabase/server";
import { refreshMatchesIfDue } from "@/server/volleyball/sync";
import type {
  Player,
  Profile,
  SecondaryRole,
  TeamEvent,
  Post,
  Lineup,
  Notification,
} from "@/lib/domain";

export const getAccount = cache(async () => {
  if (!isConfigured()) return null;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,base_role,account_status,created_at,profile_photos(storage_path)")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Kunne ikke hente kontoen. Prøv igjen.");
  return data as unknown as Profile;
});
export const requireAccount = cache(async () => {
  const profile = await getAccount();
  if (!profile) redirect("/auth/sign-in");
  if (profile.account_status !== "approved")
    redirect(`/auth/${profile.account_status === "pending" ? "pending" : "rejected"}`);
  return profile;
});
export async function requireAdmin() {
  const profile = await requireAccount();
  if (profile.base_role !== "admin") redirect("/feed");
  return profile;
}
export const getRoles = cache(async (account?: Profile): Promise<SecondaryRole[]> => {
  const profile = account ?? (await requireAccount());
  if (profile.base_role !== "player") return [];
  const db = await createClient();
  const { data, error } = await db
    .from("player_secondary_roles")
    .select("role_key")
    .eq("player_user_id", profile.id);
  if (error) throw new Error("Kunne ikke hente ansvarsroller.");
  return (data ?? []).map((r) => r.role_key as SecondaryRole);
});
export const getRoster = cache(async (account?: Profile): Promise<Player[]> => {
  if (!account) await requireAccount();
  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select(
      "id,full_name,base_role,account_status,created_at,profile_photos(storage_path),player_profiles(jersey_number),player_positions:player_positions!player_positions_player_user_id_fkey(position_key,is_primary),player_secondary_roles:player_secondary_roles!player_secondary_roles_player_user_id_fkey(role_key)",
    )
    .eq("account_status", "approved")
    .in("base_role", ["player", "coach"])
    .order("full_name");
  if (error) throw new Error("Kunne ikke hente laget.");
  return data as unknown as Player[];
});
export async function withAuthorPhotos<T extends { author_user_id: string }>(
  posts: T[],
): Promise<T[]> {
  if (!posts.length) return posts;
  const db = await createClient();
  const { data, error } = await db
    .from("profile_photos")
    .select("user_id,storage_path")
    .in("user_id", [...new Set(posts.map((post) => post.author_user_id))]);
  // Optional photos must never make posts or comments unavailable.
  if (error) return posts;
  const photos = new Map((data ?? []).map((photo) => [photo.user_id, photo.storage_path]));
  return posts.map((post) => ({
    ...post,
    author_photo_path: photos.get(post.author_user_id) ?? null,
  }));
}
async function withDiscussionCounts<T extends { id: string }>(items: T[], kind: "post" | "event") {
  if (!items.length) return items;
  const db = await createClient();
  const { data, error } = await db.rpc("get_discussion_counts", {
    data: { target_type: kind, ids: items.map((item) => item.id) },
  });
  // An optional summary must never prevent posts/events from loading during a rollout.
  if (error) {
    console.warn("Discussion counts unavailable; check the discussion-counts migration.");
    return items;
  }
  const counts = data as Record<string, import("@/lib/discussions").DiscussionCounts>;
  return items.map((item) => ({ ...item, discussion_counts: counts[item.id] }));
}
export async function getPosts(page = 1, kind?: string, account?: Profile) {
  if (!account) await requireAccount();
  const db = await createClient();
  let query = db
    .from("posts")
    .select("*,post_media(id,alt_text,sort_order,width,height)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (kind === "lineup") query = query.eq("post_type", "lineup");
  if (kind === "roles") query = query.not("secondary_role_context_key", "is", null);
  const { data, error, count } = await query.range((page - 1) * 12, page * 12 - 1);
  if (error) throw new Error("Kunne ikke hente innlegg.");
  const [posts, counted] = await Promise.all([
    withAuthorPhotos(data as Post[]),
    withDiscussionCounts(data as Post[], "post"),
  ]);
  return {
    posts: posts.map((post, index) => ({
      ...post,
      discussion_counts: counted[index].discussion_counts,
    })),
    count: count ?? 0,
  };
}
export async function getPost(id: string, account?: Profile) {
  if (!account) await requireAccount();
  const db = await createClient();
  const { data, error } = await db
    .from("posts")
    .select("*,post_media(id,alt_text,sort_order,width,height)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Kunne ikke hente innlegget.");
  return data ? (await withAuthorPhotos([data as Post]))[0] : null;
}
const eventSelect =
  "*,match_details(opponent,home_away,team_sets,opponent_sets),volunteer_assignments(player_user_id)";
export async function getEvents(past = false, kind?: string, page = 1, account?: Profile) {
  if (!account) await requireAccount();
  if (!kind || kind === "match") await refreshMatchesIfDue();
  const db = await createClient();
  let query = db
    .from("schedule_events")
    .select(eventSelect, { count: "exact" })
    .order("starts_at", { ascending: !past })
    .order("id");
  query = past
    ? query.lt("starts_at", new Date().toISOString())
    : query.or(`starts_at.gte.${new Date().toISOString()},starts_at.is.null`);
  if (kind) query = query.eq("event_type", kind);
  const { data, error, count } = await query.range((page - 1) * 24, page * 24 - 1);
  if (error) throw new Error("Kunne ikke hente terminlisten.");
  return {
    events: await withDiscussionCounts(data as unknown as TeamEvent[], "event"),
    count: count ?? 0,
  };
}
export async function getEvent(id: string, account?: Profile) {
  if (!account) await requireAccount();
  const db = await createClient();
  const { data, error } = await db
    .from("schedule_events")
    .select(eventSelect)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Kunne ikke hente arrangementet.");
  return data as unknown as TeamEvent | null;
}
export async function getLineup(matchId: string, account?: Profile): Promise<Lineup | null> {
  if (!account) await requireAccount();
  const db = await createClient();
  const { data, error } = await db
    .from("lineups")
    .select("*,schedule_events(*,match_details(*)),lineup_revisions(*,lineup_revision_slots(*))")
    .eq("match_event_id", matchId)
    .maybeSingle();
  if (error) throw new Error("Kunne ikke hente oppstillingen.");
  return data as unknown as Lineup | null;
}
export async function getLineupById(id: string, account?: Profile): Promise<Lineup | null> {
  if (!account) await requireAccount();
  const db = await createClient();
  const { data, error } = await db
    .from("lineups")
    .select("*,schedule_events(*,match_details(*)),lineup_revisions(*,lineup_revision_slots(*))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Kunne ikke hente oppstillingen.");
  return data as unknown as Lineup | null;
}
export async function getNotifications(account?: Profile): Promise<Notification[]> {
  const profile = account ?? (await requireAccount());
  const db = await createClient();
  const { data, error } = await db
    .from("notifications")
    .select("id,title,body,target_type,target_id,read_at,created_at")
    .eq("user_id", profile.id)
    .order("read_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Kunne ikke hente varsler.");
  return data as Notification[];
}

export async function getVolunteerWorkPoints(account?: Profile): Promise<VolunteerWorkPoints[]> {
  if (!account) await requireAccount();
  const db = await createClient();
  const { data, error } = await db
    .from("profiles")
    .select(
      "id,full_name,volunteer_work_points!volunteer_work_points_player_user_id_fkey(points,version)",
    )
    .eq("account_status", "approved")
    .eq("base_role", "player");
  if (error) throw new Error("Kunne ikke hente dugnadspoeng.");
  const players = data as unknown as {
    id: string;
    full_name: string;
    volunteer_work_points: { points: number; version: number } | null;
  }[];
  return players
    .map((player) => ({
      id: player.id,
      full_name: player.full_name,
      points: player.volunteer_work_points?.points ?? 0,
      version: player.volunteer_work_points?.version ?? 0,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.full_name.localeCompare(b.full_name, "nb") ||
        a.id.localeCompare(b.id),
    );
}
