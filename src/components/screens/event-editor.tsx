"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState, MissingRecord } from "@/components/query-state";
import { Redirect } from "@/components/redirect";
import { BackLink, PageHeading } from "@/components/ui";
import { EventForm, ImportedMatchTitleForm } from "@/components/event-form";
import { canManageEvent, eventTypes, type TeamEvent, type EventType } from "@/lib/domain";
export default function NewEvent() {
  return <EventEditor />;
}
export function EditEvent() {
  const { id } = useParams<{ id: string }>();
  const { scope } = useTeam();
  const client = useQueryClient();
  const query = useQuery(queries.event(scope, id, client));
  return (
    <QueryState query={query} title="Hendelsen kunne ikke hentes">
      {(event) => (event ? <EventEditor key={id} event={event} /> : <MissingRecord />)}
    </QueryState>
  );
}
function EventEditor({ event }: { event?: TeamEvent }) {
  const { profile, roles } = useTeam();
  const allowed = (Object.keys(eventTypes) as EventType[]).filter((type) =>
    canManageEvent(profile, roles, type, event?.created_by_user_id),
  );
  if (!allowed.length || (event && !allowed.includes(event.event_type)))
    return <Redirect href={event ? `/schedule/${event.id}` : "/schedule"} />;
  return (
    <div className="narrow-page">
      <BackLink href={event ? `/schedule/${event.id}` : "/schedule"}>
        {event ? "Tilbake til hendelsen" : "Tilbake til terminlisten"}
      </BackLink>
      <PageHeading
        title={
          event?.external_source === "volleyballlive"
            ? "Rediger tittel"
            : event
              ? "Rediger hendelse"
              : "Ny hendelse"
        }
      />
      {event?.external_source === "volleyballlive" ? (
        <ImportedMatchTitleForm event={event} />
      ) : (
        <EventForm event={event} allowed={event ? [event.event_type] : allowed} />
      )}
    </div>
  );
}
