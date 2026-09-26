import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { eventTone, eventHighlight, eventTypes, type TeamEvent } from "@/lib/domain";
import { dateLabel } from "@/lib/dates";
import { importedMatchStatus } from "@/lib/event-dates";
import { DiscussionCounts } from "./discussion-counts";
import { Badge } from "./ui";
export function EventCard({ event, href }: { event: TeamEvent; href?: string }) {
  return (
    <Link
      className="event-card card event-highlight"
      style={{ "--role-color": `var(--${eventHighlight(event)})` } as CSSProperties}
      href={href ?? `/schedule/${event.id}`}
    >
      <div className="event-date">
        <span>{event.starts_at ? dateLabel(event.starts_at, "MMM") : "Dato"}</span>
        <strong>{event.starts_at ? dateLabel(event.starts_at, "dd") : "–"}</strong>
        <small>{event.starts_at ? dateLabel(event.starts_at, "EEE") : "Uavklart"}</small>
      </div>
      <div className="event-card-content">
        <div className="event-labels">
          <Badge tone={eventTone[event.event_type]}>{eventTypes[event.event_type]}</Badge>
          {event.external_status && importedMatchStatus[event.external_status] && (
            <Badge tone="amber">{importedMatchStatus[event.external_status]}</Badge>
          )}
          {event.creator_base_role_snapshot === "coach" && <Badge tone="coach">Trener</Badge>}
        </div>
        <h2>{event.title}</h2>
        <div className="event-meta">
          <span>
            <CalendarDays size={14} />
            {event.starts_at && !event.external_time_unknown
              ? dateLabel(event.starts_at, "HH:mm")
              : "Tidspunkt ikke fastsatt"}
            {event.ends_at && `–${dateLabel(event.ends_at, "HH:mm")}`}
          </span>
          {event.location && (
            <span>
              <MapPin size={14} />
              {event.location}
            </span>
          )}
        </div>
      </div>
      {event.match_details?.team_sets !== null && event.match_details?.team_sets !== undefined ? (
        <strong className="match-score">
          {event.match_details.team_sets} – {event.match_details.opponent_sets}
        </strong>
      ) : (
        <ArrowUpRight size={19} className="event-arrow" />
      )}
      <DiscussionCounts counts={event.discussion_counts} />
    </Link>
  );
}
export function SmallEvent({ event }: { event: TeamEvent }) {
  return (
    <Link
      href={`/schedule/${event.id}`}
      className="small-event event-highlight"
      style={{ "--role-color": `var(--${eventHighlight(event)})` } as CSSProperties}
    >
      <div className="small-event-date">
        <strong>{event.starts_at ? dateLabel(event.starts_at, "dd") : "–"}</strong>
        <span>{event.starts_at ? dateLabel(event.starts_at, "MMM") : "Dato"}</span>
      </div>
      <div className="small-event-content">
        <span className={`event-type-text tone-${eventTone[event.event_type]}`}>
          {eventTypes[event.event_type]}
          {event.creator_base_role_snapshot === "coach" && " · Trener"}
          {event.external_status &&
            importedMatchStatus[event.external_status] &&
            ` · ${importedMatchStatus[event.external_status]}`}
        </span>
        <strong>{event.title}</strong>
        <small>
          {event.starts_at && !event.external_time_unknown
            ? dateLabel(event.starts_at, "EEE HH:mm")
            : "Tidspunkt ikke fastsatt"}{" "}
          {event.location && `· ${event.location}`}
        </small>
      </div>
      <DiscussionCounts counts={event.discussion_counts} />
    </Link>
  );
}
