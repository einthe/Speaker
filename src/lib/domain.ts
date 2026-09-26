import { z } from "zod";
z.config(z.locales.no());

export const baseRoles = { admin: "Administrator", coach: "Trener", player: "Spiller" } as const;
export const secondaryRoles = {
  captain: "Kaptein",
  vice_captain: "Visekaptein",
  social_media_manager: "SoMe",
  team_manager: "Oppmann",
  travel_coordinator: "Reiseansvarlig",
  social_coordinator: "Sosialansvarlig",
  financial_manager: "Økonomiansvarlig",
  volunteer_work_coordinator: "Dugnadsansvarlig",
  fine_manager: "Botsjef",
} as const;
export const registrationRoleKeys = [
  "social_media_manager",
  "team_manager",
  "travel_coordinator",
  "social_coordinator",
  "financial_manager",
  "volunteer_work_coordinator",
  "fine_manager",
] as const;
export type RegistrationRequest = {
  base_role: "player" | "coach";
  jersey_number: number | null;
  roles: (typeof registrationRoleKeys)[number][];
};
export const positions = {
  outside_hitter: "Kant",
  middle_blocker: "Midt",
  opposite: "Dia",
  setter: "Legger",
  libero: "Libero",
} as const;
export const lineupRoles = {
  setter: { label: "Legger", position: "setter", offset: 0 },
  k1: { label: "K1", position: "outside_hitter", offset: 1 },
  m1: { label: "M1", position: "middle_blocker", offset: 2 },
  opposite: { label: "Dia", position: "opposite", offset: 3 },
  k2: { label: "K2", position: "outside_hitter", offset: 4 },
  m2: { label: "M2", position: "middle_blocker", offset: 5 },
  libero: { label: "Libero", position: "libero", offset: 6 },
} as const;
export type LineupRole = keyof typeof lineupRoles;
export function courtPosition(role: LineupRole, setterPosition: number) {
  return role === "libero" ? null : ((setterPosition - 1 + lineupRoles[role].offset) % 6) + 1;
}
export const eventTypes = {
  match: "Kamp",
  practice: "Trening",
  social: "Sosialt",
  volunteer_work: "Dugnad",
  travel: "Reise",
  team_logistics: "Lag / praktisk",
  finance: "Økonomi",
  other: "Annet",
} as const;
export const notificationTriggers = {
  post_by_captain: "Innlegg fra Kaptein",
  post_by_vice_captain: "Innlegg fra Visekaptein",
  post_by_social_media_manager: "Innlegg fra SoMe",
  post_by_team_manager: "Innlegg fra Oppmann",
  post_by_travel_coordinator: "Innlegg fra Reiseansvarlig",
  post_by_social_coordinator: "Innlegg fra Sosialansvarlig",
  post_by_financial_manager: "Innlegg fra Økonomiansvarlig",
  post_by_volunteer_work_coordinator: "Innlegg fra Dugnadsansvarlig",
  post_by_fine_manager: "Innlegg fra Botsjef",
  event_by_team_manager: "Hendelser fra Oppmann",
  event_by_travel_coordinator: "Hendelser fra Reiseansvarlig",
  event_by_social_coordinator: "Hendelser fra Sosialansvarlig",
  event_by_financial_manager: "Hendelser fra Økonomiansvarlig",
  event_by_volunteer_work_coordinator: "Hendelser fra Dugnadsansvarlig",
  normal_post_created: "Nye innlegg",
  post_by_coach: "Innlegg fra trener",
  event_by_coach: "Hendelser fra trener",
  other_event_created: "Andre hendelser",
  post_comment_created: "Kommentarer på innlegg",
  event_comment_created: "Kommentarer på hendelser",
  comment_reply_created: "Svar på kommentarer",
  post_reaction_created: "Reaksjoner på innlegg",
  event_reaction_created: "Reaksjoner på hendelser",
  fine_received: "Mottatt bot",
  volunteer_points_changed: "Endrede dugnadspoeng",
  role_context_post_created: "Nye innlegg fra ansvarsroller",
  match_created: "Nye kamper",
  match_updated: "Endringer i kamper",
  practice_created: "Nye treninger",
  practice_updated: "Endringer i treninger",
  lineup_published: "Publiserte kampoppstillinger",
  social_event_created: "Nye sosiale arrangementer",
  travel_event_created: "Nye reiser",
  team_logistics_event_created: "Nye praktiske hendelser",
  finance_event_created: "Nye betalingsfrister",
  volunteer_event_created: "Nye dugnader",
  volunteer_assignment_created: "Tildeling av dugnad",
} as const;
export type BaseRole = keyof typeof baseRoles;
export type SecondaryRole = keyof typeof secondaryRoles;
export type Position = keyof typeof positions;
export type EventType = keyof typeof eventTypes;
export type AccountStatus = "pending" | "approved" | "rejected" | "disabled";
export type Profile = {
  profile_photos?: { storage_path: string } | null;
  id: string;
  full_name: string;
  base_role: BaseRole | null;
  account_status: AccountStatus;
  created_at: string;
};
export type Player = Profile & {
  player_profiles: { jersey_number: number | null } | null;
  player_positions: { position_key: Position; is_primary: boolean }[];
  player_secondary_roles: { role_key: SecondaryRole }[];
};
export type Match = {
  opponent: string;
  home_away: "home" | "away" | "neutral";
  team_sets: number | null;
  opponent_sets: number | null;
};
export type TeamEvent = {
  discussion_counts?: import("./discussions").DiscussionCounts;
  id: string;
  event_type: EventType;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  created_by_user_id: string | null;
  external_source?: string | null;
  external_source_url?: string | null;
  external_status?: "scheduled" | "postponed" | "cancelled" | "unavailable" | null;
  external_time_unknown?: boolean;
  last_synced_at?: string | null;
  creator_base_role_snapshot?: BaseRole | null;
  updated_at: string;
  match_details: Match | null;
  volunteer_assignments?: { player_user_id: string }[];
};
export type Slot = {
  lineup_role?: LineupRole | null;
  player_user_id: string;
  court_position: number | null;
  is_libero: boolean;
  full_name_snapshot: string | null;
  jersey_number_snapshot: number | null;
  primary_position_snapshot: Position | null;
};
export type Revision = {
  setter_position?: number | null;
  id: string;
  lineup_id: string;
  revision_number: number;
  status: "draft" | "published";
  is_current_published: boolean;
  published_at: string | null;
  lineup_revision_slots: Slot[];
};
export type Lineup = {
  id: string;
  match_event_id: string;
  lineup_revisions: Revision[];
  schedule_events: TeamEvent;
};
export type Post = {
  discussion_counts?: import("./discussions").DiscussionCounts;
  author_photo_path?: string | null;
  id: string;
  author_user_id: string;
  author_name_snapshot: string;
  post_type: "normal" | "lineup";
  title: string;
  body: string;
  base_role_snapshot: BaseRole;
  secondary_role_context_key: SecondaryRole | null;
  secondary_role_context_label_snapshot: string | null;
  created_at: string;
  edited_at: string | null;
  updated_at: string;
  lineup_id: string | null;
  post_media: import("./post-media").PostMedia[] | import("./post-media").PostMedia | null;
};
export type Notification = {
  id: string;
  title: string;
  body: string;
  target_type: import("./notification-links").NotificationTarget;
  target_id: string | null;
  read_at: string | null;
  created_at: string;
};

export function canCoach(profile: Profile) {
  return (
    profile.account_status === "approved" &&
    (profile.base_role === "admin" || profile.base_role === "coach")
  );
}
const roleEvents: Partial<Record<SecondaryRole, EventType>> = {
  team_manager: "team_logistics",
  travel_coordinator: "travel",
  social_coordinator: "social",
  financial_manager: "finance",
  volunteer_work_coordinator: "volunteer_work",
};
export function canManageEvent(
  profile: Profile,
  roles: SecondaryRole[],
  type: EventType,
  creator?: string | null,
) {
  if (profile.account_status !== "approved") return false;
  if (profile.base_role === "admin") return true;
  if (profile.base_role === "coach") return type === "match" || type === "practice";
  return (
    profile.base_role === "player" &&
    (!creator || creator === profile.id) &&
    roles.some((role) => roleEvents[role] === type)
  );
}
export const uuid = z.string().uuid();
const title = z
  .string()
  .trim()
  .min(1, "Skriv en tittel.")
  .max(160, "Tittelen kan ha høyst 160 tegn.");
const registrationFields = {
  full_name: z.string().trim().min(2, "Skriv fullt navn.").max(100),
  email: z.email("Skriv en gyldig e-postadresse."),
  password: z.string().min(12, "Passordet må ha minst 12 tegn.").max(128),
};
export const registrationSchema = z.discriminatedUnion("base_role", [
  z.object({
    ...registrationFields,
    base_role: z.literal("player"),
    jersey_number: z.number().int().min(0).max(99),
    roles: z.array(z.enum(registrationRoleKeys)).max(registrationRoleKeys.length).default([]),
  }),
  z.object({ ...registrationFields, base_role: z.literal("coach") }),
]);
export const postSchema = z.object({
  id: uuid.optional(),
  title,
  body: z.string().trim().min(1, "Skriv litt tekst.").max(10000),
  role_context: z
    .enum(Object.keys(secondaryRoles) as [SecondaryRole, ...SecondaryRole[]])
    .nullable(),
  expected_updated_at: z.string().optional(),
});
export const eventSchema = z
  .object({
    id: uuid.optional(),
    event_type: z.enum(Object.keys(eventTypes) as [EventType, ...EventType[]]),
    title,
    description: z.string().max(10000).nullable(),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime().nullable(),
    location: z.string().max(200).nullable(),
    opponent: z.string().trim().max(100).nullable(),
    home_away: z.enum(["home", "away", "neutral"]),
    team_sets: z.number().int().min(0).max(3).nullable(),
    opponent_sets: z.number().int().min(0).max(3).nullable(),
    assignments: z.array(uuid).max(100),
    expected_updated_at: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.ends_at && value.ends_at <= value.starts_at)
      ctx.addIssue({ code: "custom", message: "Sluttid må være etter starttid." });
    if (value.event_type === "match" && !value.opponent)
      ctx.addIssue({ code: "custom", message: "Skriv navn på motstanderen." });
    if ((value.team_sets === null) !== (value.opponent_sets === null))
      ctx.addIssue({ code: "custom", message: "Fyll ut begge settscorene." });
  });
export const lineupSchema = z
  .object({
    match_id: uuid,
    setter_position: z.number().int().min(1).max(6),
    expected_revision: z.number().int().min(0),
    publish: z.boolean(),
    slots: z
      .array(
        z.object({
          player_user_id: uuid,
          lineup_role: z.enum(Object.keys(lineupRoles) as [LineupRole, ...LineupRole[]]),
          court_position: z.number().int().min(1).max(6).nullable(),
          is_libero: z.boolean(),
        }),
      )
      .max(7),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.slots.map((s) => s.lineup_role)).size !== value.slots.length ||
      value.slots.some(
        (s) =>
          s.court_position !== courtPosition(s.lineup_role, value.setter_position) ||
          s.is_libero !== (s.lineup_role === "libero"),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Oppstillingen har ugyldige roller eller rotasjon.",
      });
    const starters = value.slots.filter((s) => !s.is_libero);
    const unique = new Set(value.slots.map((s) => s.player_user_id));
    if (unique.size !== value.slots.length)
      ctx.addIssue({ code: "custom", message: "En spiller kan bare velges én gang." });
    if (
      value.slots.filter((s) => s.is_libero).length > 1 ||
      value.slots.some((s) => s.is_libero !== (s.court_position === null))
    )
      ctx.addIssue({ code: "custom", message: "Oppstillingen har ugyldige posisjoner." });
    if (new Set(starters.map((s) => s.court_position)).size !== starters.length)
      ctx.addIssue({ code: "custom", message: "Hver posisjon kan bare ha én spiller." });
    if (value.publish && starters.length !== 6)
      ctx.addIssue({ code: "custom", message: "Velg seks forskjellige spillere før publisering." });
  });
export const userSchema = z.object({
  id: uuid,
  full_name: z.string().trim().min(2).max(100),
  base_role: z.enum(["player", "coach"]),
  account_status: z.enum(["approved", "rejected", "disabled"]),
  jersey_number: z.number().int().min(0).max(99).nullable(),
  roles: z
    .array(z.enum(Object.keys(secondaryRoles) as [SecondaryRole, ...SecondaryRole[]]))
    .max(Object.keys(secondaryRoles).length),
});
export const positionSchema = z
  .object({
    id: uuid,
    primary: z.enum(Object.keys(positions) as [Position, ...Position[]]).nullable(),
    secondary: z.array(z.enum(Object.keys(positions) as [Position, ...Position[]])).max(5),
  })
  .refine(
    (v) => !v.primary || !v.secondary.includes(v.primary),
    "Primærposisjonen kan ikke også være sekundærposisjon.",
  );
export const notificationSchema = z.object({
  trigger_key: z.enum(
    Object.keys(notificationTriggers) as [
      keyof typeof notificationTriggers,
      ...(keyof typeof notificationTriggers)[],
    ],
  ),
  enabled: z.boolean(),
  email_enabled: z.boolean(),
});
export const imageSchema = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .positive()
    .max(10 * 1024 * 1024, "Bildet kan være høyst 10 MB."),
});
export const roleTone: Record<SecondaryRole, string> = {
  captain: "gold",
  vice_captain: "gold",
  social_media_manager: "pink",
  team_manager: "blue",
  travel_coordinator: "teal",
  social_coordinator: "purple",
  financial_manager: "green",
  volunteer_work_coordinator: "orange",
  fine_manager: "gold",
};
export const eventTone: Record<EventType, string> = {
  match: "green",
  practice: "blue",
  social: roleTone.social_coordinator,
  volunteer_work: roleTone.volunteer_work_coordinator,
  travel: roleTone.travel_coordinator,
  team_logistics: roleTone.team_manager,
  finance: roleTone.financial_manager,
  other: "muted",
};

export function eventHighlight(event: TeamEvent) {
  const tone = event.creator_base_role_snapshot === "coach" ? "coach" : eventTone[event.event_type];
  return tone === "muted" ? "neutral-highlight" : tone;
}
