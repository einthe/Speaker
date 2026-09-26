import type {
  Lineup,
  Notification,
  Player,
  Post,
  Profile,
  SecondaryRole,
  RegistrationRequest,
} from "@/lib/domain";

export type Access = {
  profile: Profile;
  roles: SecondaryRole[];
  scope: string;
  imageLimitMB: number;
  responsiveImages: boolean;
};
export type ImageSettings = { responsive_images: boolean; version: number };
export function accessScope(profile: Profile, roles: SecondaryRole[]) {
  return encodeURIComponent(
    JSON.stringify([profile.id, profile.base_role, profile.account_status, [...roles].sort()]),
  );
}
export type AdminUsers = {
  users: (Profile & { email: string; registration_request?: RegistrationRequest | null })[];
  players: Player[];
};
export type NotificationRule = { trigger_key: string; enabled: boolean; email_enabled: boolean };
export type NotificationSettings = {
  rules: NotificationRule[];
  delivery: { mode: "disabled" | "preview" | "resend"; configured: boolean; missing: string[] };
  queue: {
    recipients: { id: string; full_name: string; email: string }[];
    pending: number;
    sent: number;
    failed: number;
    recent: {
      id: string;
      title: string;
      body: string;
      full_name: string;
      status: string;
      last_error: string | null;
    }[];
  };
};
export type PostList = { posts: Post[]; count: number };
export type Change = { kind: string; id?: string; postId?: string; matchId?: string };
export type { Lineup, Notification };
