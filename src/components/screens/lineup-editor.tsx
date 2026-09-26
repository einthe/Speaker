"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState, MissingRecord } from "@/components/query-state";
import { Redirect } from "@/components/redirect";
import { BackLink, PageHeading } from "@/components/ui";
import { LineupEditor } from "@/components/lineup-editor";
import { canCoach } from "@/lib/domain";
export default function EditLineup() {
  const { id } = useParams<{ id: string }>();
  const { profile, scope } = useTeam();
  const client = useQueryClient();
  const enabled = canCoach(profile);
  const event = useQuery({ ...queries.event(scope, id, client), enabled });
  const lineup = useQuery({ ...queries.lineup(scope, id), enabled });
  const roster = useQuery({ ...queries.roster(scope), enabled });
  if (!enabled) return <Redirect href={`/schedule/${id}`} />;
  return (
    <>
      <BackLink href={`/schedule/${id}`}>Tilbake til kampen</BackLink>
      <QueryState query={event} title="Kampen kunne ikke hentes">
        {(event) => {
          if (!event || event.event_type !== "match") return <MissingRecord />;
          return (
            <>
              <PageHeading title="Kampoppstilling" description={event.title} />
              <QueryState query={lineup} title="Oppstillingen kunne ikke hentes">
                {(lineup) => (
                  <QueryState query={roster} title="Spillerne kunne ikke hentes">
                    {(roster) => {
                      const latest = [...(lineup?.lineup_revisions ?? [])].sort(
                        (a, b) => b.revision_number - a.revision_number,
                      )[0];
                      return (
                        <LineupEditor
                          matchId={id}
                          players={roster.filter((p) => p.base_role === "player")}
                          revision={latest}
                          version={latest?.revision_number ?? 0}
                        />
                      );
                    }}
                  </QueryState>
                )}
              </QueryState>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
