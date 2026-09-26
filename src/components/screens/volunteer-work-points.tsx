"use client";
import { useQuery } from "@tanstack/react-query";
import { HandHelping } from "lucide-react";
import { queries } from "@/lib/cache/queries";
import { canManageEvent } from "@/lib/domain";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import { ActionForm, Submit } from "@/components/forms";
import { EmptyState, PageHeading } from "@/components/ui";

export default function VolunteerWorkPoints() {
  const { profile, roles, scope } = useTeam();
  const query = useQuery(queries.volunteerWorkPoints(scope));
  const editable = canManageEvent(profile, roles, "volunteer_work");
  return (
    <>
      <PageHeading title="Dugnadspoeng" />
      <QueryState query={query} title="Dugnadspoengene kunne ikke hentes">
        {(players) =>
          players.length ? (
            <div
              className="card standings-scroll"
              role="region"
              aria-label="Dugnadspoeng"
              tabIndex={0}
            >
              <table className="standings-table points-table">
                <caption className="sr-only">Spillere rangert etter dugnadspoeng</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Plassering</span>#
                    </th>
                    <th scope="col">Spiller</th>
                    <th scope="col">Poeng</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, index) => (
                    <tr
                      key={player.id}
                      className={player.id === profile.id ? "standings-team-highlight" : undefined}
                    >
                      <td>{index + 1}</td>
                      <th scope="row">
                        {player.full_name}
                        {player.id === profile.id && <span className="sr-only"> (deg)</span>}
                      </th>
                      <td>
                        {editable ? (
                          <ActionForm className="points-form" key={player.version}>
                            <input type="hidden" name="action" value="volunteer_work_points" />
                            <input type="hidden" name="id" value={player.id} />
                            <input type="hidden" name="expected_version" value={player.version} />
                            <label className="sr-only" htmlFor={`points-${player.id}`}>
                              Poeng for {player.full_name}
                            </label>
                            <input
                              id={`points-${player.id}`}
                              name="points"
                              type="number"
                              required
                              min={0}
                              max={2147483647}
                              step={1}
                              defaultValue={player.points}
                            />
                            <Submit secondary>Lagre</Submit>
                          </ActionForm>
                        ) : (
                          player.points.toLocaleString("nb-NO")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card">
              <EmptyState icon={<HandHelping size={28} />} title="Ingen spillere ennå">
                <p>Godkjente spillere vises her når de har fått tilgang.</p>
              </EmptyState>
            </div>
          )
        }
      </QueryState>
    </>
  );
}
