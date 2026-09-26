"use client";
import { useQuery } from "@tanstack/react-query";
import type { Post, Profile } from "@/lib/domain";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "./team-provider";
import { PostCard } from "./posts";
export function CachedPostCard(props: { post: Post; profile: Profile; detail?: boolean }) {
  const { scope } = useTeam();
  const query = useQuery(queries.lineup(scope, props.post.lineup_id ?? "", "id"));
  return (
    <>
      <PostCard {...props} lineup={query.data} />
      {props.post.lineup_id && query.isError && (
        <p className="message error" role="alert">
          Oppstillingen kunne ikke oppdateres.{" "}
          <button className="text-button" onClick={() => void query.refetch()}>
            Prøv igjen
          </button>
        </p>
      )}
    </>
  );
}
