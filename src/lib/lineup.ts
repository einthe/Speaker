import { courtPosition, lineupRoles, type LineupRole, type Player, type Revision } from "./domain";

export function eligibleFor(player: Player, role: LineupRole) {
  return (
    player.base_role === "player" &&
    player.account_status === "approved" &&
    player.player_positions.some((position) => position.position_key === lineupRoles[role].position)
  );
}

export function initialLineup(revision: Revision | undefined, players: Player[]) {
  const slots = revision?.lineup_revision_slots ?? [];
  const setterPosition =
    revision?.setter_position ??
    slots.find((slot) => !slot.is_libero && slot.primary_position_snapshot === "setter")
      ?.court_position ??
    1;
  const selection: Partial<Record<LineupRole, string>> = {};
  let needsReview = false;
  for (const slot of slots) {
    const role =
      slot.lineup_role ??
      (slot.is_libero
        ? "libero"
        : (Object.keys(lineupRoles) as LineupRole[]).find(
            (key) => courtPosition(key, setterPosition) === slot.court_position,
          ));
    const player = players.find((p) => p.id === slot.player_user_id);
    if (role && player && eligibleFor(player, role)) selection[role] = player.id;
    else needsReview = true;
  }
  return { selection, setterPosition, needsReview };
}
