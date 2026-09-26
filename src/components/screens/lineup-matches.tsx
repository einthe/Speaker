"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import Link from "next/link";
import { ViewLink } from "@/components/view-link";
import { Redirect } from "@/components/redirect";
import { Plus, Volleyball } from "lucide-react";
import { canCoach } from "@/lib/domain";
import { BackLink, EmptyState, PageHeading, Pagination, pageNumber } from "@/components/ui";
import { EventCard } from "@/components/events";

export default function ChooseLineupMatch() {
  const { profile, scope } = useTeam();
  const params = Object.fromEntries(useSearchParams());
  const page = pageNumber(params.page);
  const past = params.history === "1";
  const query = useQuery({
    ...queries.events(scope, past, "match", page),
    enabled: canCoach(profile),
  });
  if (!canCoach(profile)) return <Redirect href="/feed" />;
  return (
    <div className="narrow-page">
      <BackLink href="/feed">Tilbake til innlegg</BackLink>
      <PageHeading
        title="Ny kampoppstilling"
        description="Velg kampen, sett opp spillerne og publiser oppstillingen i lagets feed."
      >
        <Link className="button secondary" href="/schedule/new">
          <Plus size={16} /> Opprett kamp
        </Link>
      </PageHeading>
      <nav className="filter-tabs" aria-label="Velg kamper">
        <ViewLink
          className={!past ? "selected" : ""}
          aria-current={!past ? "page" : undefined}
          href="/lineups/new"
        >
          Kommende kamper
        </ViewLink>
        <ViewLink
          className={past ? "selected" : ""}
          aria-current={past ? "page" : undefined}
          href="/lineups/new?history=1"
        >
          Tidligere kamper
        </ViewLink>
      </nav>
      <QueryState query={query} title="Kampene kunne ikke hentes">
        {({ events, count }) => <MatchList events={events} count={count} page={page} past={past} />}
      </QueryState>
    </div>
  );
}
function MatchList({
  events,
  count,
  page,
  past,
}: {
  events: import("@/lib/domain").TeamEvent[];
  count: number;
  page: number;
  past: boolean;
}) {
  return (
    <>
      <div className="event-list">
        {events.map((event) => (
          <EventCard key={event.id} event={event} href={`/schedule/${event.id}/lineup`} />
        ))}
      </div>
      {!events.length && (
        <div className="card">
          <EmptyState icon={<Volleyball size={28} />} title="Ingen kamper å velge mellom">
            <p>
              Opprett først en kamp i terminlisten. Deretter kan du velge seks spillere og en
              eventuell libero.
            </p>
            <Link className="button" href="/schedule/new">
              Opprett kamp
            </Link>
          </EmptyState>
        </div>
      )}
      <Pagination
        page={page}
        count={count}
        size={24}
        href={`/lineups/new?history=${past ? "1" : "0"}`}
      />
    </>
  );
}
