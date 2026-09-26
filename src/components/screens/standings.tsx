"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ListOrdered } from "lucide-react";
import { queries } from "@/lib/cache/queries";
import { dateLabel } from "@/lib/dates";
import type { Standing, Standings as StandingsData } from "@/lib/standings";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import { EmptyState, PageHeading } from "@/components/ui";

const columns: { key: Exclude<keyof Standing, "id" | "team">; label: string }[] = [
  { key: "played", label: "Spilt" },
  { key: "wins", label: "Vunnet" },
  { key: "losses", label: "Tapt" },
  { key: "points", label: "Poeng" },
  { key: "setsWon", label: "Sett vunnet" },
  { key: "setsLost", label: "Sett tapt" },
  { key: "setDifference", label: "Settforskjell" },
  { key: "rallyPointsWon", label: "Settpoeng vunnet" },
  { key: "rallyPointsLost", label: "Settpoeng tapt" },
  { key: "rallyPointDifference", label: "Poengforskjell" },
];

export default function Standings() {
  const { scope } = useTeam();
  const query = useQuery(queries.standings(scope));
  return (
    <>
      <PageHeading title="Tabell" description={query.data?.tournament} />
      <QueryState query={query} title="Tabellen kunne ikke hentes">
        {(data) => <StandingsView data={data} />}
      </QueryState>
    </>
  );
}

function StandingsView({ data }: { data: StandingsData }) {
  return (
    <>
      {data.season && <h2 className="section-label">{data.season}</h2>}
      {data.rows.length ? (
        <div className="card standings-scroll" role="region" aria-label="Ligatabell" tabIndex={0}>
          <table className="standings-table">
            <caption className="sr-only">{data.tournament}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Plassering</span>#
                </th>
                <th scope="col">Lag</th>
                {columns.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.id}
                  className={row.team === "NTNUI D2A" ? "standings-team-highlight" : undefined}
                >
                  <td>{row.rank ?? "–"}</td>
                  <th scope="row">{row.team}</th>
                  {columns.map((column) => (
                    <td key={column.key}>{row[column.key] ?? "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<ListOrdered size={28} />}
            title={data.published ? "Ingen tabell ennå" : "Tabellen er ikke publisert"}
          >
            <p>Tabellen vises her når den er tilgjengelig fra VolleyballLive.</p>
          </EmptyState>
        </div>
      )}
      <div className="standings-source muted">
        <a className="inline-link" href={data.sourceUrl} target="_blank" rel="noreferrer">
          VolleyballLive <ArrowUpRight size={14} />
        </a>
        <small>
          Sist hentet <time dateTime={data.fetchedAt}>{dateLabel(data.fetchedAt)}</time>
        </small>
      </div>
    </>
  );
}
