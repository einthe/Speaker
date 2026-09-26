# Read cache and navigation

## Audit before implementation

The installed Next.js 16.3.5 documentation was consulted: linking/navigation,
loading boundaries, Route Handlers, `next/form`, client data fetching with
TanStack Query, and `use cache: private`.

| Read path                         | Original execution                                                  | Latency / duplication                                                                                             |
| --------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Current account / secondary roles | Server Components and Server Actions; cookie-authenticated Supabase | React `cache()` deduplicates within a render, not across navigations.                                             |
| Feed / post detail / post editor  | Server Components calling `getPosts` / `getPost`                    | Every visit waits for a new read. Detail cannot reuse feed data.                                                  |
| Feed lineup cards                 | Async Server Component calls `getLineupById` for each card          | Separate requests after posts load.                                                                               |
| Schedule / event detail / editor  | Server Components, often with roles and roster                      | List data cannot populate detail; normal GET filter form reloads the document.                                    |
| Roster / player positions         | Server Components and editor props                                  | Repeated whole-roster reads; normal GET search form reloads the document. No separate player detail route exists. |
| Lineup editor / match history     | Server Components reading event, lineup, roster                     | Previously fetched players, matches and revisions are fetched again.                                              |
| Notifications                     | Authenticated layout, after account check                           | Blocks the layout response on an optional read.                                                                   |
| Admin users / notification rules  | Server Components with explicit admin checks                        | Repeat RPC/table reads; no client cache.                                                                          |
| Images                            | Authenticated Route Handler                                         | Private `no-store` delivery is intentional and remains unchanged.                                                 |
| Writes                            | Validated Server Actions and SQL RPCs                               | All successful writes invalidate the root layout, discarding unrelated route work.                                |

Navigation already uses Next Link except the two GET filters and the intentional
skip-to-content anchor. Auth redirects and sign-out are necessary. There are no
manual `window.location` navigations to replace.

## Approach

Keep the existing presentation and SQL mutation boundary. Move interactive reads
to an in-memory TanStack Query cache in the persistent authenticated layout, via
a small, typed, private Route Handler. Avoid a second shared server data cache:
all data is authorization-sensitive, and native route-output caching alone does
not provide entity reuse or targeted client invalidation. The query cache is not
persisted to browser storage. No Realtime or additional infrastructure is needed.

Filter tabs in the feed, schedule, lineup match picker and fines page use the
Next-integrated History API for same-page query-string changes. Selection updates
without waiting for an RSC navigation; uncached results show the existing loading
state while the private API fetch runs. Controls stay mounted during loading, and
Back/Forward, direct links and keyboard activation remain supported. Schedule
type changes use the same mechanism. Different-page links still use normal Next
navigation. Session checks include query-string changes so cached filters still
revalidate stale account access.

## Cache contract

`src/lib/cache/queries.ts` owns typed keys, query options, list/detail reuse, and
mutation invalidation. `TeamProvider` creates one QueryClient per mounted
session, above the route loading boundary. There is no module-global private
QueryClient and no localStorage/IndexedDB persistence. Inactive reads expire from
memory after 15 minutes.

| Data                           | Fresh for  | Revalidation                              |
| ------------------------------ | ---------- | ----------------------------------------- |
| Account/roles                  | 15 seconds | Stale navigation, window focus, reconnect |
| Notifications / admin users    | 15 seconds | Stale mount, window focus, reconnect      |
| Posts / lineups                | 30 seconds | Stale mount, window focus, reconnect      |
| Events / notification settings | 60 seconds | Stale mount, window focus, reconnect      |
| Roster                         | 5 minutes  | Stale mount, window focus, reconnect      |

Standings and event lists refresh every five minutes while the page is visible; other reads use the triggers above. The server-side match import is described in [VolleyballLive matches](volleyball-matches.md). Feed and event records seed complete records into matching detail queries in the same scope, marked
stale so a canonical read always runs. Failed canonical reads retain those records. Roster search and editor player choices reuse the same roster query.
Lineup records are cached separately from posts so they can refresh independently.
No speculative database prefetching is added: Next Link prefetches route shells,
and already-loaded list records provide the immediate detail view.

`QueryState` shows small loading/error states only when a query has no data.
Background errors keep existing content and offer retry. The initial direct visit
still needs an authorized network read. The layout no longer waits for
notifications. The proxy uses Supabase's `getClaims()` token verification/refresh,
which can use cached public signing keys; private data paths still call
`getUser()` and check current account status. Symmetric-key projects retain the
SDK's Auth-server verification fallback.

## Authorization boundary

Every `/api/team/[resource]` read validates the cookie-authenticated current user,
account status, and roles. The client supplies its expected scope (user ID, base
role, status, sorted secondary roles); the server computes that scope independently
and refuses mismatches before returning data. This header is a consistency check,
not an authentication credential. Admin resources additionally check the admin
role. Supabase RLS continues to apply using the user's cookie-authenticated client.
All responses use `Cache-Control: private, no-store`; nothing is cached on a shared
server/CDN or in browser disk storage by this layer.

A detected 401/403/context change cancels in-flight queries, clears the client
cache, hides the private view, and restarts at an authorized route. Explicit auth
transitions also broadcast a data-free signal to other tabs. The only deliberate
full-document navigations are authentication/context boundaries, which discard
Next's private Router Cache as well as TanStack data. Restoring a document from
BFCache re-checks authorization. Normal links, pagination, and GET filters use
client navigation. The cache cannot make data already delivered to an approved
user unreadable; changes made elsewhere are discovered on the next authorized
read or stale session recheck, without adding realtime infrastructure.

## Mutations and editing

Server Actions retain Zod validation, current-account checks, SQL RPC authorization,
image validation, stale-version checks and historical snapshots. They return a
small change descriptor and destination. The form invalidates only the affected
query families and navigates with the router; root-layout invalidation is removed.
New/edited post and event details are fetched canonically before navigation. Deletes
remove detail entries and remove deleted posts from cached feed lists. Notification
read state updates only after the server confirms success. Permission/approval,
lineup publication and image uploads have no optimistic authorization-sensitive UI.

Post/event editors and lineup drafts retain the version originally paired with
their local fields. A background read must not advance a hidden version token under
an unsaved edit. Concurrent edits still produce the existing stale-edit error.
The same keys and invalidation function can later be called by optional Realtime
listeners without changing the views.

## Verification

- `npm test`: real SQL/RLS tests plus query freshness, scope isolation, detail-seeding
  semantics, targeted invalidation and post rendering.
- `npm run test:e2e:local`: desktop/mobile workflows against the isolated backend,
  plus held-response navigation tests. The latter attach request counts and
  placeholder display timing as `navigation-evidence.json` in Playwright results.
- The browser tests check no document reloads for page links or filters; cached
  feed/roster/event reuse; refreshing stale content without a skeleton; canonical
  details; unchanged unsaved-edit versions; direct reads, anonymous/admin denial,
  context mismatch, sign-out/back navigation and disabled accounts.
- Hosted Supabase Auth/Storage and an actual Vercel deployment still require the
  disposable integration environment described in README. The local adapter runs
  real production SQL but simulates those HTTP services.

References: installed Next.js documentation above, [TanStack defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults),
[placeholder data](https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data),
and [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).
