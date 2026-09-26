# NTNUI Volleyball D2A

A private, single-team web app built from `ntnuivolleyballd2a-codex-instructions.md`. Norwegian Bokmål UI, dark mode, Next.js App Router, TypeScript, Supabase Auth/Postgres/Storage, and Zod.

## What is implemented

- Email/password registration with player/coach choice, player jersey number and optional Verv for admin review. Email confirmation, password recovery, and pending/approved/rejected/disabled accounts. See [registration setup](docs/registration.md).
- Admin approval, rejection, deactivation/reactivation, player/coach roles, jersey numbers, secondary roles, and player positions. Admin promotion is **only** a direct database operation.
- Paginated posts, historical author/role snapshots, own-post editing, admin moderation, and optional private images with descriptions.
- **Bøter**: ranked totals and expandable histories for players/coaches, a fine-type catalog for everyone with editing for **Botsjef** and admins. Includes exact NOK amounts, historical prices and annulment. See [fine system setup and demo](docs/fines.md) for the required migrations.
- Team-wide automatic image sizing can be toggled under **Administrasjon → Bildeinnstillinger**. Apply `supabase/migrations/202609210001_image_settings.sql` before using the toggle in production; the demo applies it on restart. Private caching and access checks remain enabled in both modes.
- Threaded comments and GIPHY meme reactions on post/event details and expandable post feed cards, with author editing and admin moderation. Click a post's main area to open it; links and gallery controls remain independent. See [discussion setup](docs/discussions.md) for the required migration and API key.
- Upcoming and archived events, category permissions, match opponents/results, and structured volunteer assignments. No local attendance/RSVP system.
- A roster without email addresses or admin accounts; coach/admin position editing.
- Incomplete lineup drafts, a responsive court and separate libero, immutable versioned snapshots, accessible player lists, publication to the match and feed, and revision history.
- Admin-controlled in-app and Resend email notifications, with separate channel switches for roles, events, discussions, fines and volunteer points. Admins can simulate a notification email to one selected member without creating actual activity. New rules/email switches start off; existing in-app preferences are preserved. See [email setup and testing](docs/email-notifications.md).
- In-memory read caching with background refresh and list-to-detail reuse. Feed, schedule, lineup and fine tabs select immediately while results load; see [cache design and verification](docs/read-cache.md).
- Thirteen color palettes: six NTNUI variants (Klassisk, Sort, Mørkegrønn, Skoggrønn, Koksgrå and Stålgrå), plus Skog, Petroleum, Nattblå, Plomme, Rav, Burgunder and Grafitt. The NTNUI family combines black, dark green or gray surfaces with yellow, green and red club accents. Klassisk includes subtle diagonal stripes inspired by the club reference. A saved NTNUI choice now selects Klassisk; other saved palettes are unchanged. Choose **Fargepalett** in the account menu or on an authentication page. The choice is saved in this browser and synchronized between tabs; no account data is stored with it.
- Database-enforced authorization, stale-edit checks, private image delivery, automated PostgreSQL/RLS tests, browser tests, and CI.

The deployed application requires Supabase configuration and never exposes demo accounts. Local demo tooling runs separately from the application; authentication, permissions and RLS still apply.

### Post and lineup fixes

Post cards support both older cached single-image records and the current multi-image gallery. Apply `202609230002_post_gallery.sql` with `npx supabase db push` before deploying the gallery update; existing images are preserved. Restarting the local demo applies it automatically.

Images display loading placeholders and reserve their space before loading. New uploads store dimensions; older images use a stable fallback frame. Apply `202609230003_post_image_dimensions.sql` with `npx supabase db push` before deploying this update. See [private image delivery](docs/private-images.md) for details.

Previously viewed post photos and avatars appear immediately when switching sections within the same login session, with stale images refreshed in the background. The bounded in-memory image cache clears on sign-out and access changes. This caching update needs no additional migration or environment variable.

Posts accept up to 10 private JPEG, PNG or WebP images, with a limit of 3 MB per image (or a lower configured `MAX_IMAGE_SIZE_MB`). Images are uploaded individually to stay below Vercel's request limit, validated and converted to WebP on the server. A failed upload keeps the post and completed images; retrying does not duplicate them. Galleries use hover arrows on desktop, native swipe on mobile, keyboard arrows and direct image selectors. The author/admin can append images when editing or remove the current image from the post detail view. Browser and home-screen icons use a black-and-white D2A monogram.

Coaches and administrators can start from **Kampoppstilling** on the feed or schedule, select a match, then save a draft or publish. Publishing adds the lineup to the feed. Players cannot access the editor. Failed uploads retain the saved post ID so retrying does not create duplicates. Feed sections have independent error boundaries, and retry refetches their content.

Decorative slogans, redundant captions, and repeated footer text have been removed. Form guidance, permissions explanations, and error messages remain.

## Role-based lineups and content colors

Apply `supabase/migrations/202609200001_lineup_roles_and_event_authors.sql` before deploying this update (`supabase db push` for a linked project). Do not reset the database. For the local demo, stop and restart `npm run dev` to apply it automatically with fresh fictional data.

Lineups now store Legger, K1, M1, Dia, K2, M2 and optional Libero, plus the setter's starting position. Both primary and secondary player positions qualify for selection; SQL also checks eligibility, duplicate players/roles and rotation. Empty/incomplete drafts retain their setter position. Historical revisions stay unchanged. The editor infers compatible selections from older lineups and asks for review when an old selection no longer fits.

Events use the same responsibility colors as posts; coach-authored content has a coral highlight. New events preserve the creator's role when edited. Existing events are backfilled using their creator's current role because no earlier author-role snapshot exists. Tropp displays all positions with the primary first, e.g. `Kant / Dia`.

## Profile pictures and shortcuts

Users can upload, replace or remove their own profile picture from **Min profil** in the account menu. Pictures are private to approved members, cropped to a square, and shown in the account menu, Tropp and post headers. JPEG, PNG and WebP uploads are limited to 3 MB. Apply `supabase/migrations/202609200002_profile_photos.sql` before deploying this feature (`supabase db push`); restarting the local demo applies it automatically with fresh fictional data.

The **Snarveier** navigation links open upcoming matches, volunteer events and social events in Terminliste. On mobile, the top-left menu button opens the sidebar over a dimmed backdrop. It closes when selecting a link, tapping the backdrop or close button, or pressing Escape; keyboard focus stays within the open menu.

## Prerequisites

- Node.js **24 LTS** and npm (`.nvmrc` is included).
- For connected development/deployment: a Supabase project, or the Supabase CLI and Docker for a local stack. The demo needs neither.
- GitHub and Vercel accounts only when publishing the repository/deploying. The app also supports standard Node hosting via `npm start`.

## Local demo

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. No Docker, Supabase project or `.env.local` is needed. Sign in with one of these fictional accounts; all use **`DemoVolleyball123!`**:

| Email                | Access                                                             |
| -------------------- | ------------------------------------------------------------------ |
| `admin@demo.test`    | Administration, approvals, notifications and all content           |
| `coach@demo.test`    | Matches, practices, player positions and lineup drafts/publication |
| `player@demo.test`   | Regular player and captain; posts and read access                  |
| `theo@demo.test`     | Botsjef; fine types and fines for players/coaches                  |
| `pending@demo.test`  | Pending approval screen                                            |
| `disabled@demo.test` | Disabled account screen                                            |

The demo contains 12 players with jerseys/positions, two coaches, secondary responsibilities, text/image posts, upcoming and past matches, training sessions, other event categories, volunteer assignments, notifications, a published lineup and an incomplete draft. Dates are relative to startup so upcoming events stay useful. Additional fictional roster accounts use their first names in lowercase at `@demo.test`, with the same password.

Use the normal forms to create, edit and delete content, upload images, approve registrations and publish lineups. Changes survive browser reloads and hot reloads, but **stopping/restarting the command resets all demo data, passwords, sessions and uploaded files**. Stop with Ctrl+C. To change the app port, use `npm run dev -- --port 3001`.

The launcher starts an in-memory PostgreSQL database (PGlite) with the real migrations and RLS, and a local HTTP adapter for Supabase Auth/Storage. Email delivery/confirmation and recovery links are simulated, so use a connected Supabase environment to test email flows and hosted-service behavior.

Isolation: the launcher overrides Supabase/site variables only in its child process, even if `.env.local` points to a real project. It binds to loopback, uses `.next-demo`, writes no environment files, and refuses production/Vercel execution. Demo scripts and seed data are outside `src`, excluded from Vercel uploads, and never imported by the app. `npm run build` / `npm start` retain the normal production application and do not start or seed a demo backend.

To develop against your own configured local or hosted Supabase project, use **`npm run dev:connected`** and follow the setup below. Browser integration tests also use that explicit command, so they cannot silently switch to demo data.

## Connected Supabase setup

```sh
npm ci
cp .env.example .env.local
```

Edit `.env.local`:

| Variable                               | Purpose                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project URL from Supabase → Project Settings → API.                                                                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`), or the local/legacy anon key. Safe for the browser; RLS protects data.                         |
| `NEXT_PUBLIC_SITE_URL`                 | Exact app origin, e.g. `http://localhost:3000` or `https://ntnuivolleyballd2a.no`. Used in auth redirects.                           |
| `NEXT_PUBLIC_GIPHY_API_KEY`            | GIPHY browser API key; required for meme reactions. Set in Vercel Production (and Preview if used) before building.                  |
| `MAX_IMAGE_SIZE_MB`                    | Optional application upload limit; defaults to 3 MB to fit Vercel request limits; capped at the bucket's 10 MB limit on other hosts. |

Private user requests use the publishable key and RLS. Background match sync and email delivery require the server-only `SUPABASE_SECRET_KEY`. Never put this key in `NEXT_PUBLIC_*`, source files, or browser code. Hosted Supabase connection details are not included in this repository.

### Hosted Supabase

1. Create one Supabase project, preferably near Norway.
2. Install the Supabase CLI using its official installation instructions.
3. Authenticate, link, and apply the migration:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Alternatively, execute the files in `supabase/migrations/` in filename order in the project's SQL Editor on an empty application schema. On existing databases, apply only migrations that have not already been applied.

4. The migration creates tables, constraints, indexes, Auth signup trigger, RLS policies, RPCs, disabled notification rules, and the **private** `post-images` bucket. Do not make the bucket public.
5. Enable email/password sign-in. Set the minimum password length to 12 and enable email confirmation for production. Configure production SMTP in Supabase before inviting users.
6. Set Auth → URL Configuration → Site URL to the app origin. Add exact allowed redirects:

   ```text
   http://localhost:3000/auth/callback
   http://localhost:3000/auth/callback?next=/auth/update-password
   https://ntnuivolleyballd2a.no/auth/callback
   https://ntnuivolleyballd2a.no/auth/callback?next=/auth/update-password
   ```

   The default Supabase email templates must retain `{{ .ConfirmationURL }}`. The callback exchanges the PKCE code using the initiating browser's cookies. If a confirmation link is opened in another browser, sign in again after confirmation.

7. Configure `.env.local`, then:

   ```sh
   npm run dev:connected
   ```

8. Open `http://localhost:3000`, register, confirm the email if enabled, and bootstrap the first admin.

### Local Supabase

With Docker running:

```sh
supabase start
supabase db reset
supabase status
```

Copy the local API URL and publishable/anon key to `.env.local`. The checked-in `supabase/config.toml` disables email confirmation **only in the local stack**. `supabase db reset` deletes local data and reapplies migrations; never run it against production. No real credentials or user accounts are seeded.

## Bootstrap the first administrator

Register the intended account normally. In the secure Supabase SQL Editor, find its UUID:

```sql
select id, email from auth.users where email = 'YOUR_ADMIN_EMAIL';
```

Verify it is the intended account, then run with that UUID:

```sql
update public.profiles
set base_role = 'admin',
    account_status = 'approved',
    approved_at = now(),
    updated_at = now()
where id = 'REPLACE_WITH_VERIFIED_USER_UUID'::uuid;
```

Refresh the app. Administrasjon → Brukere og tilganger now allows approval as **Spiller** or **Trener**. No application endpoint can promote an admin or modify a protected admin account. Additional admins require the same secure database process.

## Development and tests

```sh
npm run dev             # isolated fictional demo
npm run dev:connected   # configured Supabase project
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

`npm test` applies the production SQL migration to PGlite, an embedded PostgreSQL engine, with minimal Supabase auth/storage schema shims. It tests real SQL permissions and RLS using separate `anon`/`authenticated` roles, not mocked authorization functions. It also tests validation, Oslo time conversion, and rendering posts with the actual object/null media shape. This does not test the hosted Supabase Auth or Storage HTTP services.

Browser and accessibility tests:

```sh
npx playwright install chromium
npm run test:e2e:local
npm run test:e2e:demo
npm run test:e2e
```

`test:e2e:demo` starts the same `npm run dev` launcher with deliberately invalid remote credentials and verifies seeded content, private images, role restrictions, post edits/deletes, registration and admin approval. It runs at desktop and mobile widths.

Public tests run at desktop and mobile widths and verify route protection, private image denial, registration/recovery forms, keyboard use, WCAG checks, and horizontal overflow. Screenshots are written to `test-results/`.

`test:e2e:local` runs both public and authenticated workflows without Docker or project credentials. It builds and starts the production Next app on port 3100 and a loopback-only test adapter on port 54329. The adapter executes the production migration and RLS in PGlite and derives relationship cardinality from database constraints. Auth and Storage HTTP services are simulated; this catches application/rendering bugs but does not replace testing hosted Supabase. No application authentication bypass is added. The in-memory test database is discarded when the server stops.

Authenticated coverage includes post/image creation, private image access, editing, image removal, deletion, failed-upload retry, isolated feed errors, registration/approval, roster administration, event permissions, volunteer assignments, notifications, account disabling, and lineup drafts/publication/history/results. Failure-injection tests run only with the isolated adapter.

The full browser test (`tests/e2e/team.spec.ts`) registers a user, approves them from a separate admin session, writes a post, verifies role restrictions, and publishes a coach's lineup. It requires a **disposable** Supabase instance with the migration applied and email confirmation disabled. Configure the application's normal Supabase variables for that same instance and set these test-only environment variables in the test process:

```text
E2E_SUPABASE_URL=<test project URL>
E2E_SUPABASE_SERVICE_ROLE_KEY=<test-only privileged key>
E2E_BASE_URL=<optional already-running app origin>
```

Without the first two variables, `test:e2e` skips authenticated integration tests. Set `E2E_REQUIRE_BACKEND=1` to fail instead of skipping; CI and `test:e2e:local` enforce this. Hosted tests generate unique synthetic accounts and leave test data for inspection. Reset only the disposable test database afterward. **Never point these tests at the production project.** The privileged key is used exclusively by the Node test process to arrange fixtures and is never imported by app code.

The GitHub Actions workflow runs code checks, builds, the isolated browser suite, and a separate full Supabase integration job with local Docker services.

## League standings (Tabell)

`/standings` appears after Terminliste in both menus and uses the existing approved-account checks. No database migration or credentials are needed for the default source. See [standings integration](docs/standings.md) for the verified endpoints, field mapping and limitations.

- Server-only `VOLLEYBALL_SEASON_ID` and `VOLLEYBALL_TOURNAMENT_ID` select the competition (defaults: `201070` / `449623`). Change both together and restart/redeploy.
- Without NIF credentials, the server reads the public JSON service used by VolleyballLive. With **both** `NIF_CLIENT_ID` and `NIF_CLIENT_SECRET`, it prefers the official NIF API using OAuth client credentials; `NIF_SCOPE` defaults to `data_ta_read`. Request credentials/access from [NIF Digital](https://idrettsforbundet.atlassian.net/wiki/spaces/DDTII/pages/335577089). Partial credentials are an error, not a silent fallback. Never prefix these variables with `NEXT_PUBLIC_`.
- Validated public competition data uses Next's shared Data Cache with five-minute revalidation. A stale request returns the previous result and refreshes in the background; failed refreshes retain that result. The open page polls the private app API every five minutes while visible. This is demand-driven, not a scheduled job; changes can take an additional polling interval to appear. “Sist hentet” shows the last successful source fetch. Empty cache plus source outage shows the normal retry state.
- Tokens stay in server memory, expire early, and are renewed once on API 401. Browser responses remain `private, no-store`; users never receive source credentials or tokens. The demo uses the same public standings source (real league data, unlike its fictional roster/events).

## VolleyballLive matches

NTNUI 2's fixtures are imported as normal matches in Terminliste, with five-minute update checks while the schedule is open and preserved lineup IDs. Matches and standings display NTNUI 2/3/4 as **NTNUI D2A/D2B/D2C**. Opponent names match standings, titles default to NTNUI D2A first, and coaches/admins can save a title that survives future imports. All matches are neutral, without home/away labels. The verified tournament currently contains 16 matches for our team (source team ID `913845`).

Apply `supabase/migrations/202609200003_volleyball_matches.sql`, `supabase/migrations/202609200004_match_display.sql` and `supabase/migrations/202609230004_volleyball_refresh.sql` (or run `npx supabase db push`), set server-only `SUPABASE_SECRET_KEY` and `CRON_SECRET`, and redeploy. The Vercel cron remains a daily fallback at 05:00 UTC; schedule reads import when the five-minute cooldown expires. Set `VOLLEYBALL_TEAM_ID` to change the selected team. The fictional demo remains isolated; `VOLLEYBALL_MATCH_SYNC_ENABLED=1 npm run dev` enables live imports into its disposable local database. See [setup, field mapping and update behavior](docs/volleyball-matches.md).

## Architecture and security

- The authenticated layout protects entry; client reads use a scoped, in-memory TanStack Query cache backed by cookie-authenticated `/api/team/[resource]` handlers. Every read checks current authentication, status and permissions, and returns `private, no-store`. Auth transitions clear private caches across tabs. `proxy.ts` verifies/refreshes sessions; Server Actions independently authorize writes. See [the cache contract](docs/read-cache.md).
- Every private table has RLS. Browser roles have safe `SELECT` grants and no direct table mutations. Reviewed `SECURITY DEFINER` RPCs enforce current account status, ownership, event category, and role context, with an empty `search_path`. Internal trigger/notification functions are not executable by API roles.
- Admin email lookup is a restricted RPC over `auth.users`. Profiles and roster queries have no email column.
- Post authors and role context are captured by the database. Post edits preserve historical context. Each lineup save creates a version; published player snapshots are never rewritten. The feed points to the current published version.
- Writes return Norwegian errors. Post/event edits compare `updated_at`; lineup saves lock the match and compare the latest revision to prevent silent overwrite.
- Images use generated paths in private buckets. Validated WebP variants are reused from the server Data Cache and selected responsively by the browser. `/media/[id]` and `/avatars/[id]` check current access and source existence before serving images or returning an ETag-based `304`; browser caching is `private, no-cache, must-revalidate`. Direct API uploads are decoded and validated before entering the cache. No public media URLs or public image-optimizer caches are used. See [private image delivery](docs/private-images.md).
- Notifications are created in the content transaction, so failed transactions cannot announce unpublished content. Disabled triggers produce no rows. Read state is owner-only. Public activity notifications exclude the actor; personal fine/points/assignment notifications go only to their recipient. Email jobs share the content transaction, are private to server workers, and recheck approval, verified email and the enabled rule before delivery.
- The interface renders plain text; it does not accept HTML/Markdown scripts. Next.js handles Server Action origin checks. No auth credentials or tokens are logged.
- Disabling an account immediately blocks future database access. No hard-delete account workflow exists; history remains intact.

## Deliberate V1 choices

- Skog is the default green/lime palette. Alternate theme tokens live in `src/app/palettes.css`, with palette names in `src/lib/palettes.ts`; role/event labels and colors are centralized in `src/lib/domain.ts`. The account menu also offers **Fremheving av innlegg og hendelser**: **Standard** preserves the subtle highlighting, while **Hele kortet** uses an opaque, subtle responsibility or coach tint across the entire card, blended with the selected palette’s panel color. **Farger på innlegg og hendelser** independently switches between **Myke** (the original soft colors) and **Klassiske** (clearer red, blue, green, yellow and other familiar hues), with either highlighting style. **Høy kontrast** turns normal and muted text white, darkens palette surfaces, and strengthens borders while retaining responsibility and accent colors. Normal posts keep their existing style. These preferences are saved separately for each account in this browser and synchronized between tabs. Palette and highlighting preferences use localStorage; private query data is not persisted there.
- Local fonts are bundled with the app. No third-party font requests or external image services are required.
- `schedule_events.location` is the canonical venue; there is no redundant match venue field.
- Event category is immutable after creation. Delete/recreate an incorrectly categorized event if it has no lineup history.
- A match with any lineup history cannot be deleted. Record a cancellation in the title/description to preserve the match and revisions.
- Every lineup save creates a revision, including incomplete drafts. Coaches/admins see drafts; normal members see published versions only.
- Secondary-role event managers can manage only their own events while they retain the relevant role. Coaches share management of matches/practices.
- Changing player → coach clears live player data and secondary roles transactionally, preserving published snapshots. Multiple holders of a responsibility are allowed.
- Disabling a player removes active secondary roles but retains jersey/position records. A retained non-null jersey stays reserved until an admin clears it. This avoids silently reassigning numbers on reactivation.
- All times display in `Europe/Oslo`. Nonexistent spring-transition times are rejected. The ambiguous fall-transition hour follows `date-fns-tz`'s deterministic interpretation; choose an unambiguous time for events around that transition.
- The notification dropdown displays up to 50 rows, prioritizing unread notifications. Past records remain in the database.
- The default upload limit is 3 MB to fit [Vercel's 4.5 MB request limit](https://vercel.com/docs/functions/limitations), including multipart overhead. The bucket allows 10 MB for future direct-to-storage uploads. Raise the app limit only on hosting that supports larger request bodies.
- Failed media attachment leaves the successfully saved text post in place and explains how to retry. Cleanup attempts remove unattached objects; an interrupted network request can leave an orphan object for later administrative cleanup.
- Spond integration is not implemented without an API contract. VolleyballLive uses the external event IDs/source/sync timestamps; these fields are not writable through normal event forms. A future Spond import should use a separate server adapter.

## Deploy to Vercel and the target domain

1. Create a GitHub repository and push these files, including `package-lock.json` and migrations. Do not commit `.env.local`.
2. Import the repository into Vercel as a Next.js project, with the project root as the root directory and Node.js 24.
3. Set the Supabase URL/key and `NEXT_PUBLIC_SITE_URL=https://ntnuivolleyballd2a.no` for Production. Also set `NEXT_PUBLIC_GIPHY_API_KEY` to enable meme reactions. Local `.env.local` values are not uploaded to Vercel; add them in the project’s Environment Variables settings. After changing a `NEXT_PUBLIC_` variable, create a new deployment so the browser bundle includes it.
4. Apply migrations to the production Supabase project **before** deploying the app. Bootstrap the admin after registration.
5. Deploy using the default `npm run build` build command. No Vercel-specific data services are required.
6. Add `ntnuivolleyballd2a.no` in Vercel → Project → Settings → Domains. Apply the exact DNS records Vercel supplies at your domain registrar and wait for domain/TLS verification. Add `www` only if you want it and redirect it to the canonical domain.
7. Verify Supabase's production Site URL and callback allowlist match the final HTTPS domain. Preview deployments should use a separate test project and explicit callback URLs, not wildcard access to production.
8. Verify in two separate browsers: anonymous users reach only auth screens; new registrations stay pending; admin approval unlocks access; coach/player permissions differ; media is denied after sign-out; an enabled notification arrives only at its intended recipients.
9. Run the PostgreSQL authorization tests and the full browser workflow against a staging project before launch. Review Supabase's policy/table grants and confirm `post-images.public = false` after any subsequent migration.

Source implementation references: [Next.js Proxy](https://nextjs.org/docs/app/getting-started/proxy), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), and [Supabase CLI local development](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Dugnadspoeng

`/volunteer_work_points` lists approved players by points, highest first, highlighting the signed-in player's row. New players start at 0; totals are non-negative whole numbers. When creating or editing a Dugnad, the assignment list shows these totals beside each player and sorts from lowest to highest. Administrators and players assigned **Dugnadsansvarlig** can set or reduce totals. Database permissions enforce this independently of the UI, and version checks prevent stale forms from overwriting newer totals.

Apply `supabase/migrations/202609200005_volunteer_work_points.sql` before deploying this feature. The local demo applies it automatically on restart and includes fictional totals. Use `lucas@demo.test` (Dugnadsansvarlig) or `admin@demo.test` to edit them, with the usual demo password `DemoVolleyball123!`.
