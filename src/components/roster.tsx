import { positions, secondaryRoles, roleTone, type Player } from "@/lib/domain";
import { ActionForm, Submit } from "./forms";
import { Avatar, Badge } from "./ui";
export function PlayerCard({ player, editable }: { player: Player; editable: boolean }) {
  const assignedPositions = [...player.player_positions].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  return (
    <article className="card player-card">
      <div className="player-card-top">
        <Avatar
          name={player.full_name}
          userId={player.id}
          path={player.profile_photos?.storage_path}
          large
        />
        <span className="jersey-number">
          {player.player_profiles?.jersey_number !== null &&
          player.player_profiles?.jersey_number !== undefined ? (
            <>
              <small>#</small>
              {player.player_profiles.jersey_number.toString().padStart(2, "0")}
            </>
          ) : (
            "–"
          )}
        </span>
      </div>
      <h2>{player.full_name}</h2>
      <p className="player-position">
        {assignedPositions.length
          ? assignedPositions.map((p) => positions[p.position_key]).join(" / ")
          : "Posisjon ikke satt"}
        <span>Spiller</span>
      </p>
      <div className="player-roles">
        {player.player_secondary_roles.map(({ role_key }) => (
          <Badge key={role_key} tone={roleTone[role_key]}>
            {secondaryRoles[role_key]}
          </Badge>
        ))}
      </div>
      {editable && (
        <details className="position-editor">
          <summary>Rediger spillerposisjoner</summary>
          <PositionForm player={player} />
        </details>
      )}
    </article>
  );
}
export function PositionForm({ player }: { player: Player }) {
  return (
    <ActionForm>
      <input type="hidden" name="action" value="positions" />
      <input type="hidden" name="id" value={player.id} />
      <label>
        Primærposisjon
        <select
          name="primary"
          defaultValue={player.player_positions.find((p) => p.is_primary)?.position_key ?? ""}
        >
          <option value="">Ingen primærposisjon</option>
          {Object.entries(positions).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Sekundærposisjoner</legend>
        <div className="checkbox-grid">
          {Object.entries(positions).map(([key, label]) => (
            <label key={key} className="checkbox-label">
              <input
                type="checkbox"
                name="secondary"
                value={key}
                defaultChecked={player.player_positions.some(
                  (p) => p.position_key === key && !p.is_primary,
                )}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Submit>Lagre posisjoner</Submit>
    </ActionForm>
  );
}
