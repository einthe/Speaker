"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventTypes, type EventType, type TeamEvent } from "@/lib/domain";
import { queries } from "@/lib/cache/queries";
import { localInput } from "@/lib/dates";
import { ActionForm, Submit } from "./forms";
import { useTeam } from "./team-provider";
import { QueryState } from "./query-state";
export function EventForm({
  event: initialEvent,
  allowed,
}: {
  event?: TeamEvent;
  allowed: EventType[];
}) {
  const [event] = useState(initialEvent);
  const [kind, setKind] = useState<EventType>(event?.event_type ?? allowed[0]);
  const { scope } = useTeam();
  const pointsQuery = useQuery({
    ...queries.volunteerWorkPoints(scope),
    enabled: kind === "volunteer_work",
  });
  return (
    <ActionForm className="card editor form-stack">
      <input type="hidden" name="action" value="event" />
      {event && (
        <>
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="expected_updated_at" value={event.updated_at} />
        </>
      )}
      <label>
        Type hendelse
        {event ? (
          <>
            <input value={eventTypes[event.event_type]} disabled />
            <input type="hidden" name="event_type" value={event.event_type} />
          </>
        ) : (
          <select
            name="event_type"
            value={kind}
            onChange={(e) => setKind(e.target.value as EventType)}
          >
            {allowed.map((k) => (
              <option key={k} value={k}>
                {eventTypes[k]}
              </option>
            ))}
          </select>
        )}
      </label>
      <label>
        Tittel
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={event?.title}
          placeholder="Gi hendelsen en tydelig tittel"
        />
      </label>
      <div className="form-grid">
        <label>
          Starter
          <input
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={event?.starts_at ? localInput(event.starts_at) : undefined}
          />
        </label>
        <label>
          Slutter <span className="muted">(valgfritt)</span>
          <input
            name="ends_at"
            type="datetime-local"
            defaultValue={event?.ends_at ? localInput(event.ends_at) : undefined}
          />
        </label>
      </div>
      <p className="field-hint">Alle tidspunkt er i norsk tid (Europe/Oslo).</p>
      <label>
        Sted
        <input
          name="location"
          maxLength={200}
          defaultValue={event?.location ?? ""}
          placeholder="Hall, adresse eller møtested"
        />
      </label>
      {kind === "match" && (
        <fieldset>
          <legend>Kampinformasjon</legend>
          <div className="form-grid">
            <label>
              Motstander
              <input
                name="opponent"
                maxLength={100}
                required
                defaultValue={event?.match_details?.opponent}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Sett vunnet · NTNUI
              <input
                name="team_sets"
                type="number"
                min={0}
                max={3}
                defaultValue={event?.match_details?.team_sets ?? ""}
              />
            </label>
            <label>
              Sett vunnet · motstander
              <input
                name="opponent_sets"
                type="number"
                min={0}
                max={3}
                defaultValue={event?.match_details?.opponent_sets ?? ""}
              />
            </label>
          </div>
          <p className="field-hint">La begge resultatfeltene stå tomme til kampen er i gang.</p>
        </fieldset>
      )}
      <label>
        Beskrivelse
        <textarea
          name="description"
          maxLength={10000}
          rows={5}
          defaultValue={event?.description ?? ""}
          placeholder="Det laget trenger å vite …"
        />
      </label>
      {kind === "volunteer_work" && (
        <fieldset>
          <legend>Spillere som er satt opp på dugnad</legend>
          <p className="field-hint">
            Dette er oppgavefordeling. Påmelding og oppmøte håndteres i Spond.
          </p>
          <QueryState query={pointsQuery} title="Dugnadspoengene kunne ikke hentes">
            {(players) => (
              <>
                <div className="checkbox-grid volunteer-assignment-list">
                  {[...players]
                    .sort(
                      (a, b) =>
                        a.points - b.points ||
                        a.full_name.localeCompare(b.full_name, "nb") ||
                        a.id.localeCompare(b.id),
                    )
                    .map((player) => (
                      <label className="checkbox-label" key={player.id}>
                        <input
                          type="checkbox"
                          name="assignments"
                          value={player.id}
                          aria-labelledby={`assignment-player-${player.id}`}
                          aria-describedby={`assignment-points-${player.id}`}
                          defaultChecked={event?.volunteer_assignments?.some(
                            (a) => a.player_user_id === player.id,
                          )}
                        />
                        <span id={`assignment-player-${player.id}`}>{player.full_name}</span>{" "}
                        <span id={`assignment-points-${player.id}`} className="assignment-points">
                          {player.points.toLocaleString("nb-NO")} poeng
                        </span>
                      </label>
                    ))}
                </div>
                {!players.length && <p className="muted">Ingen godkjente spillere ennå.</p>}
              </>
            )}
          </QueryState>
        </fieldset>
      )}
      <div className="editor-footer">
        <Link className="button secondary" href={event ? `/schedule/${event.id}` : "/schedule"}>
          Avbryt
        </Link>
        <Submit disabled={kind === "volunteer_work" && pointsQuery.data === undefined}>
          {event ? "Lagre endringer" : "Opprett hendelse"}
        </Submit>
      </div>
    </ActionForm>
  );
}

export function ImportedMatchTitleForm({ event: initialEvent }: { event: TeamEvent }) {
  const [event] = useState(initialEvent);
  return (
    <ActionForm className="card editor form-stack">
      <input type="hidden" name="action" value="match-title" />
      <input type="hidden" name="id" value={event.id} />
      <input type="hidden" name="expected_updated_at" value={event.updated_at} />
      <label>
        Tittel
        <input name="title" required maxLength={160} defaultValue={event.title} />
      </label>
      <p className="field-hint">
        Tittelen beholdes når kampinformasjonen oppdateres fra VolleyballLive.
      </p>
      <div className="editor-footer">
        <Link className="button secondary" href={`/schedule/${event.id}`}>
          Avbryt
        </Link>
        <Submit>Lagre endringer</Submit>
      </div>
    </ActionForm>
  );
}
