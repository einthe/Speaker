"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import Link from "next/link";
import Form from "next/form";
import { Users, Search } from "lucide-react";
import { canCoach, positions } from "@/lib/domain";
import { Avatar, Badge, EmptyState, PageHeading } from "@/components/ui";
import { PlayerCard } from "@/components/roster";
export default function Roster() {
  const params = Object.fromEntries(useSearchParams());
  const { profile, scope } = useTeam();
  const query = useQuery(queries.roster(scope));
  return (
    <QueryState query={query} title="Troppsoversikten kunne ikke hentes">
      {(roster) => <RosterView roster={roster} profile={profile} params={params} />}
    </QueryState>
  );
}
function RosterView({
  roster,
  profile,
  params,
}: {
  roster: import("@/lib/domain").Player[];
  profile: import("@/lib/domain").Profile;
  params: Record<string, string>;
}) {
  const allPlayers = roster.filter((p) => p.base_role === "player");
  const coaches = roster.filter((p) => p.base_role === "coach");
  const players = allPlayers.filter(
    (p) =>
      (!params.q ||
        p.full_name.toLocaleLowerCase("nb").includes(params.q.toLocaleLowerCase("nb"))) &&
      (!params.position || p.player_positions.some((pos) => pos.position_key === params.position)),
  );
  return (
    <>
      <PageHeading title="Tropp">
        <span className="member-count">
          <Users size={17} /> {allPlayers.length} spillere · {coaches.length} trenere
        </span>
      </PageHeading>
      <Form action="/roster" className="roster-toolbar" scroll={false}>
        <div className="search-field">
          <Search size={18} />
          <label className="sr-only" htmlFor="roster-search">
            Søk etter spiller
          </label>
          <input
            key={params.q ?? ""}
            id="roster-search"
            name="q"
            placeholder="Søk i troppen …"
            defaultValue={params.q ?? ""}
            maxLength={100}
          />
        </div>
        <label className="sr-only" htmlFor="position-filter">
          Filtrer på posisjon
        </label>
        <select
          id="position-filter"
          name="position"
          value={params.position ?? ""}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          <option value="">Alle posisjoner</option>
          {Object.entries(positions).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {(params.q || params.position) && (
          <Link className="text-button" href="/roster">
            Nullstill
          </Link>
        )}
      </Form>
      <section>
        <h2 className="section-label">
          SPILLERE <span>{players.length}</span>
        </h2>
        <div className="roster-grid">
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} editable={canCoach(profile)} />
          ))}
        </div>
        {!players.length && (
          <div className="card">
            <EmptyState
              icon={<Users size={28} />}
              title={
                params.q || params.position ? "Ingen spillere passer søket" : "Ingen spillere ennå"
              }
            >
              <p>
                {params.q || params.position
                  ? "Prøv et annet navn eller en annen posisjon."
                  : "Godkjente spillere vises her når de har fått tilgang."}
              </p>
            </EmptyState>
          </div>
        )}
      </section>
      {coaches.length > 0 && (
        <section className="coaches-section">
          <h2 className="section-label">
            TRENERTEAMET <span>{coaches.length}</span>
          </h2>
          <div className="roster-grid">
            {coaches.map((coach) => (
              <article className="card coach-card" key={coach.id}>
                <Avatar
                  name={coach.full_name}
                  userId={coach.id}
                  path={coach.profile_photos?.storage_path}
                  large
                />
                <div>
                  <h2>{coach.full_name}</h2>
                  <Badge tone="blue">Trener</Badge>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
