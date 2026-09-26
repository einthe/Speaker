"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState, MissingRecord } from "@/components/query-state";
import Link from "next/link";
import type { CSSProperties } from "react";

import { CalendarDays, MapPin, Pencil, Volleyball } from "lucide-react";
import { canCoach, canManageEvent, eventTypes, eventTone, eventHighlight } from "@/lib/domain";
import { dateLabel } from "@/lib/dates";
import { eventDateLabel, importedMatchStatus } from "@/lib/event-dates";
import { BackLink, Badge } from "@/components/ui";
import { Court } from "@/components/court";
import { DeleteButton } from "@/components/forms";
import { LinkedText } from "@/components/linked-text";
import { Discussion } from "@/components/discussion";
export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { scope } = useTeam();
  const client = useQueryClient();
  const query = useQuery(queries.event(scope, id, client));
  return (
    <QueryState query={query} title="Hendelsen kunne ikke hentes">
      {(event) => (event ? <EventView event={event} /> : <MissingRecord />)}
    </QueryState>
  );
}
function EventView({ event }: { event: import("@/lib/domain").TeamEvent }) {
  const { profile, roles, scope } = useTeam();
  const id = event.id;
  const imported = event.external_source === "volleyballlive";
  const editable = canManageEvent(profile, roles, event.event_type, event.created_by_user_id);
  const lineupQuery = useQuery({
    ...queries.lineup(scope, id),
    enabled: event.event_type === "match",
  });
  const rosterQuery = useQuery({
    ...queries.roster(scope),
    enabled: event.event_type === "volunteer_work",
  });
  const lineup = lineupQuery.data;
  const roster = rosterQuery.data ?? [];
  const revision = lineup?.lineup_revisions.find((r) => r.is_current_published);
  const hasDraft = lineup?.lineup_revisions.some(
    (r) => r.status === "draft" && (!revision || r.revision_number > revision.revision_number),
  );
  return (
    <div className="narrow-page">
      <BackLink href="/schedule">Tilbake til terminlisten</BackLink>
      <article
        className="card event-detail event-highlight"
        style={{ "--role-color": `var(--${eventHighlight(event)})` } as CSSProperties}
      >
        <div className="event-labels">
          <Badge tone={eventTone[event.event_type]}>{eventTypes[event.event_type]}</Badge>
          {event.external_status && importedMatchStatus[event.external_status] && (
            <Badge tone="amber">{importedMatchStatus[event.external_status]}</Badge>
          )}
          {event.creator_base_role_snapshot === "coach" && <Badge tone="coach">Trener</Badge>}
        </div>
        <h1>{event.title}</h1>
        <div className="event-detail-meta">
          <span>
            <CalendarDays size={19} />
            {eventDateLabel(event)}
            {event.ends_at && ` – ${dateLabel(event.ends_at, "HH:mm")}`}
          </span>
          {event.location && (
            <span>
              <MapPin size={19} />
              {event.location}
            </span>
          )}
        </div>
        {event.match_details && (
          <div className="match-banner">
            <div>
              <span className="eyebrow">NTNUI</span>
              <strong>D2A</strong>
            </div>
            <span className="score">
              {event.match_details.team_sets !== null
                ? `${event.match_details.team_sets} – ${event.match_details.opponent_sets}`
                : "VS"}
            </span>
            <div>
              <span className="eyebrow">MOTSTANDER</span>
              <strong>{event.match_details.opponent}</strong>
            </div>
          </div>
        )}
        {event.description && (
          <p className="post-body">
            <LinkedText text={event.description} />
          </p>
        )}
        {imported && event.external_source_url && (
          <p className="muted">
            <a
              className="inline-link"
              href={event.external_source_url}
              target="_blank"
              rel="noreferrer"
            >
              VolleyballLive
            </a>
            {event.last_synced_at && (
              <small> · Sist oppdatert {dateLabel(event.last_synced_at)}</small>
            )}
          </p>
        )}
        {event.event_type === "volunteer_work" && (
          <section className="assignments">
            <h2>Satt opp på dugnad</h2>
            <QueryState query={rosterQuery} title="Spillerne kunne ikke hentes">
              {() =>
                event.volunteer_assignments?.length ? (
                  <ul>
                    {event.volunteer_assignments.map((a) => (
                      <li key={a.player_user_id}>
                        {roster.find((p) => p.id === a.player_user_id)?.full_name ??
                          "Tidligere lagmedlem"}
                        {a.player_user_id === profile.id && <Badge>Deg</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Ingen spillere er tildelt ennå.</p>
                )
              }
            </QueryState>
          </section>
        )}
        {editable && (
          <div className="editor-footer">
            <Link className="button secondary" href={`/schedule/${id}/edit`}>
              <Pencil size={15} /> {imported ? "Rediger tittel" : "Rediger hendelse"}
            </Link>
            {!imported && <DeleteButton action="delete-event" id={id} label="Slett hendelse" />}
          </div>
        )}
      </article>
      {event.event_type === "match" && (
        <section className="card match-lineup">
          <div className="section-title">
            <h2>
              <Volleyball size={20} /> Kampoppstilling
            </h2>
            {canCoach(profile) && (
              <Link className="button secondary" href={`/schedule/${id}/lineup`}>
                {hasDraft ? "Fortsett utkast" : revision ? "Ny versjon" : "Lag kampoppstilling"}
              </Link>
            )}
          </div>
          <QueryState query={lineupQuery} title="Oppstillingen kunne ikke hentes">
            {() =>
              revision ? (
                <>
                  <p className="muted">
                    Versjon {revision.revision_number} · Publisert{" "}
                    {dateLabel(revision.published_at!)}
                  </p>
                  <Court slots={revision.lineup_revision_slots} />
                  {lineup &&
                    lineup.lineup_revisions.filter(
                      (r) => r.status === "published" && !r.is_current_published,
                    ).length > 0 && (
                      <details className="revision-history">
                        <summary>Tidligere publiserte versjoner</summary>
                        {lineup.lineup_revisions
                          .filter((r) => r.status === "published" && !r.is_current_published)
                          .sort((a, b) => b.revision_number - a.revision_number)
                          .map((r) => (
                            <div key={r.id}>
                              <h3>Versjon {r.revision_number}</h3>
                              <p className="muted">{dateLabel(r.published_at!)}</p>
                              <Court slots={r.lineup_revision_slots} />
                            </div>
                          ))}
                      </details>
                    )}
                </>
              ) : (
                <p className="aside-empty">
                  {hasDraft
                    ? "Et utkast er lagret. Det er bare synlig for trenere og administrator."
                    : "Oppstillingen er ikke publisert ennå."}
                </p>
              )
            }
          </QueryState>
        </section>
      )}
      <Discussion key={id} target={{ target_type: "event", target_id: id }} />
    </div>
  );
}
