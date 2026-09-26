import { emailConfiguration } from "@/server/notifications/email";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getAccount,
  getRoles,
  getPosts,
  getPost,
  getEvents,
  getEvent,
  getRoster,
  getVolunteerWorkPoints,
  getLineup,
  getLineupById,
  getNotifications,
  withAuthorPhotos,
} from "@/server/queries";
import { createClient } from "@/lib/supabase/server";
import { accessScope } from "@/lib/cache/contract";
import { eventTypes, uuid } from "@/lib/domain";
import { discussionTargetSchema, type DiscussionData } from "@/lib/discussions";
import { getStandings } from "@/server/standings";
import { StandingsError } from "@/server/standings/config";
import { getImageSettings, getResponsiveImages } from "@/server/image-settings";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie, X-Team-Scope" },
  });
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    // Route Handlers do not inherit layout checks. Verify identity and status on every read.
    const profile = await getAccount();
    if (!profile) return json({ destination: "/auth/sign-in" }, 401);
    if (profile.account_status !== "approved")
      return json(
        { destination: `/auth/${profile.account_status === "pending" ? "pending" : "rejected"}` },
        403,
      );
    const roles = await getRoles(profile);
    const scope = accessScope(profile, roles);
    if (request.headers.get("X-Team-Scope") !== scope) return json({ destination: "/feed" }, 409);
    const { resource } = await params;
    const search = request.nextUrl.searchParams;
    const id = () => uuid.parse(search.get("id"));
    const page = () =>
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(search.get("page") ?? 1);
    let data: unknown;
    switch (resource) {
      case "fines": {
        const db = await createClient({ cache: "no-store" });
        const result = await db.rpc("get_fines");
        if (result.error) throw new Error("Bøtene kunne ikke hentes.");
        data = result.data;
        break;
      }
      case "discussion": {
        const target = discussionTargetSchema.parse({
          target_type: search.get("target_type"),
          target_id: search.get("target_id"),
        });
        const db = await createClient();
        const result = await db.rpc("get_discussion", { data: target });
        if (result.error) throw new Error("Kunne ikke hente diskusjonen.");
        const discussion = result.data as DiscussionData;
        data = { ...discussion, comments: await withAuthorPhotos(discussion.comments) };
        break;
      }
      case "standings":
        data = await getStandings();
        break;
      case "session":
        data = {
          responsiveImages: await getResponsiveImages(),
          profile,
          roles,
          scope,
          imageLimitMB: Math.min(10, Math.max(1, Number(process.env.MAX_IMAGE_SIZE_MB) || 3)),
        };
        break;
      case "image-settings":
        if (profile.base_role !== "admin") return json({ destination: "/feed" }, 403);
        data = await getImageSettings();
        break;
      case "posts":
        data = await getPosts(
          page(),
          z.enum(["", "roles", "lineup"]).parse(search.get("filter") ?? "") || undefined,
          profile,
        );
        break;
      case "post":
        data = await getPost(id(), profile);
        break;
      case "events": {
        const kind = search.get("kind") || undefined;
        if (kind && !Object.hasOwn(eventTypes, kind))
          return json({ error: "Ugyldig hendelsestype." }, 400);
        data = await getEvents(search.get("history") === "1", kind, page(), profile);
        break;
      }
      case "event":
        data = await getEvent(id(), profile);
        break;
      case "volunteer_work_points":
        data = await getVolunteerWorkPoints(profile);
        break;
      case "roster":
        data = await getRoster(profile);
        break;
      case "lineup":
        data =
          search.get("by") === "id"
            ? await getLineupById(id(), profile)
            : await getLineup(id(), profile);
        break;
      case "notifications":
        data = await getNotifications(profile);
        break;
      case "users":
      case "rules": {
        if (profile.base_role !== "admin") return json({ destination: "/feed" }, 403);
        const db = await createClient();
        if (resource === "users") {
          const [users, players] = await Promise.all([
            db.rpc("admin_users"),
            db
              .from("profiles")
              .select(
                "id,full_name,base_role,account_status,created_at,player_profiles(jersey_number),player_positions:player_positions!player_positions_player_user_id_fkey(position_key,is_primary),player_secondary_roles:player_secondary_roles!player_secondary_roles_player_user_id_fkey(role_key)",
              )
              .neq("base_role", "admin"),
          ]);
          if (users.error || players.error) throw new Error("Kunne ikke hente brukere.");
          data = { users: users.data, players: players.data };
        } else {
          const result = await db
            .from("notification_rules")
            .select("trigger_key,enabled,email_enabled")
            .order("trigger_key");
          if (result.error) throw new Error("Kunne ikke hente innstillinger.");
          const status = await db.rpc("notification_email_status");
          if (status.error) throw new Error("Kunne ikke hente leveringsstatus.");
          data = { rules: result.data, delivery: emailConfiguration(), queue: status.data };
        }
        break;
      }
      default:
        return json({ error: "Ukjent forespørsel." }, 404);
    }
    return json({ data });
  } catch (error) {
    if (error instanceof StandingsError) return json({ error: error.message }, 503);
    if (error instanceof z.ZodError) return json({ error: "Ugyldig forespørsel." }, 400);
    return json({ error: "Kunne ikke hente innholdet. Prøv igjen." }, 500);
  }
}
