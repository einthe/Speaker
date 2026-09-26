"use client";
import { useState } from "react";
import {
  courtPosition,
  lineupRoles,
  type LineupRole,
  type Player,
  type Revision,
  type Slot,
} from "@/lib/domain";
import { eligibleFor, initialLineup } from "@/lib/lineup";
import { ActionForm, Submit } from "./forms";
import { Court } from "./court";
export function LineupEditor({
  matchId,
  players,
  revision: initialRevision,
  version: initialVersion,
}: {
  matchId: string;
  players: Player[];
  revision?: Revision;
  version: number;
}) {
  const [{ revision, version }] = useState({ revision: initialRevision, version: initialVersion });
  const [initial] = useState(() => initialLineup(revision, players));
  const [selection, setSelection] = useState(initial.selection);
  const [setterPosition, setSetterPosition] = useState(initial.setterPosition);
  const slots: Slot[] = (Object.keys(selection) as LineupRole[]).flatMap((role) => {
    const player = players.find((p) => p.id === selection[role]);
    if (!player) return [];
    return [
      {
        player_user_id: player.id,
        lineup_role: role,
        court_position: courtPosition(role, setterPosition),
        is_libero: role === "libero",
        full_name_snapshot: player.full_name,
        jersey_number_snapshot: player.player_profiles?.jersey_number ?? null,
        primary_position_snapshot:
          player.player_positions.find((p) => p.is_primary)?.position_key ?? null,
      },
    ];
  });
  const roleField = (role: LineupRole) => (
    <label key={role}>
      <span>
        {lineupRoles[role].label}
        {role === "libero" ? " (valgfritt)" : ""}
      </span>
      <select
        aria-label={lineupRoles[role].label}
        name={`role_${role}`}
        value={selection[role] ?? ""}
        onChange={(event) => setSelection({ ...selection, [role]: event.target.value })}
      >
        <option value="">{role === "libero" ? "Ingen libero" : "Velg spiller"}</option>
        {players
          .filter((player) => eligibleFor(player, role))
          .map((player) => (
            <option
              key={player.id}
              value={player.id}
              disabled={Object.entries(selection).some(
                ([key, id]) => key !== role && id === player.id,
              )}
            >
              {player.player_profiles?.jersey_number != null
                ? `#${player.player_profiles.jersey_number} `
                : ""}
              {player.full_name}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <div className="lineup-editor-grid">
      <ActionForm className="card editor form-stack">
        <input type="hidden" name="action" value="lineup" />
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="expected_revision" value={version} />
        <div>
          <h2>Sett startsekseren</h2>
          <p className="muted">
            Velg spillere etter rolle. Leggerens startposisjon bestemmer rotasjonen. Valgene følger
            primær- og sekundærposisjonene i Tropp.
          </p>
        </div>
        {initial.needsReview && (
          <p className="message" role="status">
            Noen tidligere valg passer ikke med spillerposisjonene. Velg disse spillerne på nytt.
          </p>
        )}
        <label>
          Leggerens startposisjon
          <select
            name="setter_position"
            value={setterPosition}
            onChange={(event) => setSetterPosition(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((position) => (
              <option key={position} value={position}>
                P{position}
              </option>
            ))}
          </select>
        </label>
        <div className="lineup-selection">
          {[4, 3, 2, 5, 6, 1].map((position) =>
            roleField(
              (Object.keys(lineupRoles) as LineupRole[]).find(
                (role) => courtPosition(role, setterPosition) === position,
              )!,
            ),
          )}
        </div>
        {roleField("libero")}
        <p className="field-hint">
          Publisering lagrer navn, draktnummer og spillerposisjon slik de er nå. Tidligere
          publiserte versjoner bevares.
        </p>
        <div className="button-row">
          <Submit secondary name="intent" value="draft">
            Lagre utkast
          </Submit>
          <Submit name="intent" value="publish">
            Publiser oppstilling
          </Submit>
        </div>
      </ActionForm>
      <section className="card lineup-preview">
        <h2>Forhåndsvisning</h2>
        <Court slots={slots} />
      </section>
    </div>
  );
}
