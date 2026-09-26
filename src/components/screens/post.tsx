"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState, MissingRecord } from "@/components/query-state";
import { BackLink } from "@/components/ui";
import { CachedPostCard } from "@/components/cached-post-card";
import { Discussion } from "@/components/discussion";
export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, scope } = useTeam();
  const client = useQueryClient();
  const query = useQuery(queries.post(scope, id, client));
  return (
    <div className="narrow-page">
      <BackLink href="/feed">Tilbake til innlegg</BackLink>
      <QueryState query={query} title="Innlegget kunne ikke hentes">
        {(post) =>
          post ? (
            <>
              <CachedPostCard post={post} profile={profile} detail />
              <Discussion key={post.id} target={{ target_type: "post", target_id: post.id }} />
            </>
          ) : (
            <MissingRecord />
          )
        }
      </QueryState>
    </div>
  );
}
