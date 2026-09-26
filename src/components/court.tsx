"use client";
import { useQuery } from "@tanstack/react-query";
import { positions, lineupRoles, type Slot } from "@/lib/domain";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "./team-provider";
import { Avatar } from "./avatar";
export function Court({ slots, compact = false }: { slots: Slot[]; compact?: boolean }) {
  const { scope } = useTeam();
  const { data: roster } = useQuery(queries.roster(scope));
  const playerVisual = (slot?: Slot) => (
    <div className="court-player">
      {slot && (
        <Avatar
          large
          name={slot.full_name_snapshot ?? "Spiller"}
          userId={slot.player_user_id}
          path={
            roster?.find((player) => player.id === slot.player_user_id)?.profile_photos
              ?.storage_path
          }
        />
      )}
      <div className="jersey">{slot?.jersey_number_snapshot ?? "–"}</div>
    </div>
  );
  const libero = slots.find((s) => s.is_libero);
  return (
    <div className={`lineup-visual ${compact ? "compact" : ""} ${libero ? "with-libero" : ""}`}>
      <div className="court-wrap">
        <div className="court-net" aria-hidden="true" />
        <div className="court" aria-hidden="true">
          {[4, 3, 2, 5, 6, 1].map((position) => {
            const slot = slots.find((s) => s.court_position === position && !s.is_libero);
            return (
              <div className="court-slot" key={position}>
                <span className="rotation-number">{position}</span>
                {playerVisual(slot)}
                <strong title={slot?.full_name_snapshot ?? undefined}>
                  {slot?.full_name_snapshot ?? "Ledig posisjon"}
                </strong>
                {(slot?.lineup_role || slot?.primary_position_snapshot) && (
                  <small>
                    {slot.lineup_role
                      ? lineupRoles[slot.lineup_role].label
                      : positions[slot.primary_position_snapshot!]}
                  </small>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {libero && (
        <div className="libero-card">
          <span className="eyebrow">LIBERO</span>
          {playerVisual(libero)}
          <strong>{libero.full_name_snapshot}</strong>
        </div>
      )}
      <details className="lineup-text">
        <summary>Se oppstillingen som liste</summary>
        <ol>
          {[...slots]
            .sort((a, b) => (a.court_position ?? 7) - (b.court_position ?? 7))
            .map((s) => (
              <li key={s.player_user_id}>
                {s.is_libero ? "Libero" : `Posisjon ${s.court_position}`}:{" "}
                {s.jersey_number_snapshot !== null && `#${s.jersey_number_snapshot} `}
                {s.full_name_snapshot}
              </li>
            ))}
        </ol>
      </details>
    </div>
  );
}
