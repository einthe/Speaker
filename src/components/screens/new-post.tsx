"use client";
import { useTeam } from "@/components/team-provider";
import { BackLink, PageHeading } from "@/components/ui";
import { PostForm } from "@/components/posts";
import { canCoach } from "@/lib/domain";
import Link from "next/link";
export default function NewPost() {
  const { profile, roles } = useTeam();
  return (
    <div className="narrow-page">
      <BackLink href="/feed">Tilbake til innlegg</BackLink>
      <PageHeading title="Nytt innlegg" />
      {canCoach(profile) && (
        <p className="message info">
          Vil du publisere en startoppstilling?{" "}
          <Link className="inline-link" href="/lineups/new">
            Lag kampoppstilling
          </Link>
        </p>
      )}
      <PostForm roles={roles} />
    </div>
  );
}
