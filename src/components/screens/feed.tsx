"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { queries } from "@/lib/cache/queries";
import { useTeam } from "@/components/team-provider";
import { QueryState } from "@/components/query-state";
import Link from "next/link";
import { ViewLink } from "@/components/view-link";
import {
  ArrowRight,
  Plus,
  MessageSquare,
  CalendarDays,
  ArrowUpRight,
  Volleyball,
} from "lucide-react";
import { PageHeading, EmptyState, Pagination, pageNumber } from "@/components/ui";
import { CachedPostCard as PostCard } from "@/components/cached-post-card";
import { SmallEvent } from "@/components/events";
import { ContentBoundary } from "@/components/content-boundary";
import { canCoach, type Profile } from "@/lib/domain";
export default function Feed() {
  const params = Object.fromEntries(useSearchParams());
  const page = pageNumber(params.page);
  const filter = ["roles", "lineup"].includes(params.filter ?? "") ? params.filter : undefined;
  const { profile } = useTeam();
  return (
    <>
      <PageHeading title="Innlegg">
        <div className="button-row">
          {canCoach(profile) && (
            <Link className="button secondary" href="/lineups/new">
              <Volleyball size={18} /> Kampoppstilling
            </Link>
          )}
          <Link className="button" href="/posts/new">
            <Plus size={18} /> Nytt innlegg
          </Link>
        </div>
      </PageHeading>
      <div className="feed-layout">
        <div>
          <nav className="filter-tabs" aria-label="Filtrer innlegg">
            {[
              ["", "Alle innlegg"],
              ["roles", "Fra ansvarsroller"],
              ["lineup", "Kampoppstillinger"],
            ].map(([key, label]) => (
              <ViewLink
                key={key}
                href={`/feed${key ? `?filter=${key}` : ""}`}
                className={(filter ?? "") === key ? "selected" : ""}
                aria-current={(filter ?? "") === key ? "page" : undefined}
              >
                {label}
              </ViewLink>
            ))}
          </nav>
          <ContentBoundary title="Innleggene kunne ikke hentes">
            <FeedPosts page={page} filter={filter} profile={profile} />
          </ContentBoundary>
        </div>
        <aside className="feed-aside">
          <div className="feed-upcoming">
            <ContentBoundary title="Terminlisten kunne ikke hentes" href="/schedule">
              <UpcomingEvents />
            </ContentBoundary>
          </div>
          <ContentBoundary title="Troppsoversikten kunne ikke hentes" href="/roster">
            <TeamSummary />
          </ContentBoundary>
        </aside>
      </div>
    </>
  );
}

function FeedPosts({ page, filter, profile }: { page: number; filter?: string; profile: Profile }) {
  const { scope } = useTeam();
  const query = useQuery(queries.posts(scope, page, filter));
  return (
    <QueryState query={query} title="Innleggene kunne ikke hentes">
      {({ posts, count }) => (
        <FeedList posts={posts} count={count} profile={profile} page={page} filter={filter} />
      )}
    </QueryState>
  );
}
function FeedList({
  posts,
  count,
  profile,
  page,
  filter,
}: {
  posts: import("@/lib/domain").Post[];
  count: number;
  profile: Profile;
  page: number;
  filter?: string;
}) {
  return (
    <>
      <div className="post-list">
        {posts.length ? (
          posts.map((post) => (
            <ContentBoundary
              key={post.id}
              title="Dette innlegget kunne ikke vises"
              href={`/posts/${post.id}`}
            >
              <PostCard post={post} profile={profile} />
            </ContentBoundary>
          ))
        ) : (
          <div className="card">
            <EmptyState
              icon={<MessageSquare size={28} />}
              title={filter ? "Ingen innlegg i denne kategorien" : "Ingen innlegg ennå"}
            >
              <Link className="button secondary" href="/posts/new">
                Skriv et innlegg <ArrowRight size={16} />
              </Link>
            </EmptyState>
          </div>
        )}
      </div>
      <Pagination
        page={page}
        count={count}
        size={12}
        href={`/feed${filter ? `?filter=${filter}` : ""}`}
      />
    </>
  );
}

function UpcomingEvents() {
  const { scope } = useTeam();
  const query = useQuery(queries.events(scope));
  return (
    <QueryState query={query} title="Terminlisten kunne ikke hentes">
      {({ events }) => <UpcomingList events={events} />}
    </QueryState>
  );
}
function UpcomingList({ events }: { events: import("@/lib/domain").TeamEvent[] }) {
  return (
    <section className="card upcoming-card">
      <header className="section-title">
        <h2>
          <CalendarDays size={17} /> Kommende hendelser
        </h2>
        <Link href="/schedule" aria-label="Se terminlisten">
          <ArrowUpRight size={17} />
        </Link>
      </header>
      {events.length ? (
        events.slice(0, 4).map((event) => <SmallEvent key={event.id} event={event} />)
      ) : (
        <p className="aside-empty">Ingen kommende hendelser.</p>
      )}
      <Link className="aside-link" href="/schedule">
        Hele terminlisten <ArrowRight size={15} />
      </Link>
    </section>
  );
}

function TeamSummary() {
  const { scope } = useTeam();
  const query = useQuery(queries.roster(scope));
  return (
    <QueryState query={query} title="Troppsoversikten kunne ikke hentes">
      {(roster) => <TeamCount roster={roster} />}
    </QueryState>
  );
}
function TeamCount({ roster }: { roster: import("@/lib/domain").Player[] }) {
  return (
    <section className="card team-summary">
      <div className="team-count">
        <strong>{roster.filter((p) => p.base_role === "player").length}</strong>
        <span>spillere</span>
      </div>
      <Link className="inline-link" href="/roster">
        Se troppen <ArrowUpRight size={16} />
      </Link>
    </section>
  );
}
