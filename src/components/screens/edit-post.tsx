"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState, MissingRecord } from "@/components/query-state";
import { Redirect } from "@/components/redirect";
import { BackLink, PageHeading } from "@/components/ui";
import { PostForm } from "@/components/posts";
export default function EditPost() {
  const { id } = useParams<{ id: string }>();
  const { profile, roles, scope } = useTeam();
  const client = useQueryClient();
  const query = useQuery(queries.post(scope, id, client));
  return (
    <QueryState query={query} title="Innlegget kunne ikke hentes">
      {(post) => {
        if (!post) return <MissingRecord />;
        if (
          post.post_type !== "normal" ||
          (post.author_user_id !== profile.id && profile.base_role !== "admin")
        )
          return <Redirect href={`/posts/${id}`} />;
        return <PostEditor key={id} id={id} post={post} roles={roles} />;
      }}
    </QueryState>
  );
}
function PostEditor({
  id,
  post,
  roles,
}: {
  id: string;
  post: import("@/lib/domain").Post;
  roles: import("@/lib/domain").SecondaryRole[];
}) {
  return (
    <div className="narrow-page">
      <BackLink href={`/posts/${id}`}>Tilbake til innlegget</BackLink>
      <PageHeading title="Rediger innlegg" />
      <PostForm post={post} roles={roles} />
    </div>
  );
}
