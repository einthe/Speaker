"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ViewLink, updateView } from "@/components/view-link";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import Link from "next/link";
import { Plus, CalendarDays, Volleyball } from "lucide-react";
import { canCoach, canManageEvent, eventTypes, type EventType } from "@/lib/domain";
import { dateLabel } from "@/lib/dates";
import { EmptyState, PageHeading, Pagination, pageNumber } from "@/components/ui";
import { EventCard } from "@/components/events";
export default function Schedule() {
  const params = Object.fromEntries(useSearchParams());
  const past = params.history === "1";
  const kind = params.type && Object.hasOwn(eventTypes, params.type) ? params.type : undefined;
  const page = pageNumber(params.page);
  const { profile, roles, scope } = useTeam();
  const query = useQuery(queries.events(scope, past, kind, page));
  return (
    <ScheduleView
      profile={profile}
      roles={roles}
      past={past}
      kind={kind}
      page={page}
      query={query}
    />
  );
}
function ScheduleView({
  profile,
  roles,
  past,
  kind,
  page,
  query,
}: {
  profile: import("@/lib/domain").Profile;
  roles: import("@/lib/domain").SecondaryRole[];
  past: boolean;
  kind?: string;
  page: number;
  query: import("@tanstack/react-query").UseQueryResult<
    { events: import("@/lib/domain").TeamEvent[]; count: number },
    Error
  >;
}) {
  const { events = [], count = 0 } = query.data ?? {};
  const canCreate = (Object.keys(eventTypes) as EventType[]).some((type) =>
    canManageEvent(profile, roles, type),
  );
  const groups = Object.groupBy(events, (event) =>
    event.starts_at ? dateLabel(event.starts_at, "MMMM yyyy") : "Dato ikke fastsatt",
  );
  return (
    <>
      <PageHeading title="Terminliste">
        <div className="button-row">
          {canCoach(profile) && (
            <Link href="/lineups/new" className="button secondary">
              <Volleyball size={18} /> Kampoppstilling
            </Link>
          )}
          {canCreate && (
            <Link href="/schedule/new" className="button">
              <Plus size={18} /> Ny hendelse
            </Link>
          )}
        </div>
      </PageHeading>
      <div className="schedule-toolbar">
        <nav className="filter-tabs" aria-label="Tidsperiode">
          <ViewLink
            className={!past ? "selected" : ""}
            aria-current={!past ? "page" : undefined}
            href={`/schedule${kind ? `?type=${kind}` : ""}`}
          >
            Kommende
          </ViewLink>
          <ViewLink
            className={past ? "selected" : ""}
            aria-current={past ? "page" : undefined}
            href={`/schedule?history=1${kind ? `&type=${kind}` : ""}`}
          >
            Tidligere
          </ViewLink>
        </nav>
        <div className="inline-filter">
          <label className="sr-only" htmlFor="event-filter">
            Type hendelse
          </label>
          <select
            id="event-filter"
            name="type"
            value={kind ?? ""}
            onChange={(event) => {
              const params = new URLSearchParams();
              if (past) params.set("history", "1");
              if (event.target.value) params.set("type", event.target.value);
              const search = params.toString();
              updateView(`/schedule${search ? `?${search}` : ""}`);
            }}
          >
            <option value="">Alle hendelser</option>
            {Object.entries(eventTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <QueryState query={query} title="Terminlisten kunne ikke hentes">
        {() => (
          <>
            {Object.entries(groups).map(([month, entries]) => (
              <section className="schedule-month" key={month}>
                <h2 className="month-label">
                  {month} <span>{entries?.length}</span>
                </h2>
                <div className="event-list">
                  {entries?.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </section>
            ))}
            {!events.length && (
              <div className="card">
                <EmptyState
                  icon={<CalendarDays size={28} />}
                  title={past ? "Ingen tidligere hendelser" : "Ingen kommende hendelser"}
                >
                  <p>
                    {past
                      ? "Avsluttede hendelser bevares og vises her."
                      : "Når noe blir lagt i terminlisten, finner du det her."}
                  </p>
                  {canCreate && (
                    <Link className="button secondary" href="/schedule/new">
                      Opprett en hendelse
                    </Link>
                  )}
                </EmptyState>
              </div>
            )}
          </>
        )}
      </QueryState>
      <Pagination
        page={page}
        count={count}
        size={24}
        href={`/schedule?history=${past ? 1 : 0}${kind ? `&type=${kind}` : ""}`}
      />
    </>
  );
}
