# VolleyballLive match import

The schedule uses the same server-only transport, competition configuration and optional NIF OAuth credentials as [standings](standings.md). Verified against the public [schedule](https://kamper.volleyball.no/schedule?seasonId=201070&tournamentId=449623), its frontend bundle and [NIF OpenAPI schema](https://data.nif.no/swagger/v1/swagger.json) on 2026-09-20:

- JSON endpoint: `ta/TournamentMatches/?tournamentId=449623`, beneath the same official NIF / public VolleyballLive API bases used by standings. The response is `{ tournamentId, matches: [...] }`.
- The source contains 72 fixtures, including **16 for team ID 913845** (`NTNUI - K 2`, displayed as `NTNUI 2` in standings). Selection uses this stable ID, never the renamed label.
- Display aliases are shared between standings and match normalization: 913845 / NTNUI 2 → **NTNUI D2A**, 914600 / NTNUI 3 → **NTNUI D2B**, 914601 / NTNUI 4 → **NTNUI D2C**. Opponent names come from published standings by team ID, with structured squad-suffix cleanup as a fallback. Titles default to our team first. Original identifiers and official standings order are unchanged.
- `matchDate` supplies a local calendar date, `matchStartTime` / `matchEndTime` are HHMM integers in Norwegian time. Convert with `Europe/Oslo`, including daylight saving. Two current fixtures on 7 March 2027 have time `0`; show “Tidspunkt ikke fastsatt”. Unknown dates remain null and appear under “Dato ikke fastsatt”.
- `matchResult.homeGoals` / `awayGoals` are set scores and are oriented to our team for the existing match UI. Respect the tournament's match/result publication flags. No score is invented for unplayed matches.

## Deploy/setup

1. Apply `supabase/migrations/202609200003_volleyball_matches.sql`, `supabase/migrations/202609200004_match_display.sql` and `supabase/migrations/202609230004_volleyball_refresh.sql` to your Supabase project (`npx supabase db push` through your usual migration workflow).
2. Set **server-only** `SUPABASE_SECRET_KEY` to the project's Supabase secret API key (a legacy service-role key also works). This is a separate `supabase-js` client with no user cookies/session. Obtain it in Supabase's API key settings; never use `NEXT_PUBLIC_`. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
3. Set **server-only** `CRON_SECRET` to a securely generated random secret. `vercel.json` schedules `/api/cron/volleyball` daily at **05:00 UTC**; Vercel supplies `Authorization: Bearer <CRON_SECRET>`. Redeploy to register the job. See [Vercel cron security](https://vercel.com/docs/cron-jobs/manage-cron-jobs). On another host, schedule an authenticated GET/POST to that route every five minutes if refreshes without page visits are needed. There is no public manual-sync button or authentication bypass.
4. `VOLLEYBALL_TEAM_ID` defaults to `913845`, using existing season/tournament defaults. `VOLLEYBALL_MATCH_SYNC_ENABLED=0` explicitly disables imports. Missing Supabase credentials also disables imports; ordinary manually entered events remain usable.
5. With setup complete, the next schedule/feed match read imports immediately if due. A protected cron invocation can also perform the first import. No production database change or deployment is performed by adding these repository files.

## Updates and safety

Imports become eligible again **five minutes after the previous attempt finishes**, enforced by a database lease shared across requests and server instances. The page checks while visible; without visitors, the daily Vercel job remains the fallback. A two-minute lease prevents duplicate concurrent fetches and recovers from interrupted workers. Provider/write failures retain existing records and allow retry after five minutes; the daily cron and subsequent schedule reads can retry. No source payloads, credentials or tokens are logged. A failed upstream read never becomes an empty import.

Validated batches are committed atomically. The existing `(external_source, external_event_id)` uniqueness constraint keeps event UUIDs stable while updating date, time, venue, opponent and scores. Saved lineups/history remain attached. Missing or hidden matches are marked unavailable, cancelled/postponed matches get a status label; none are automatically deleted. Reappearing fixtures reuse the same IDs. Previously manually entered matches are not automatically merged: their identity cannot safely be inferred from title/date. Old competition records are retained when changing configuration.

All matches currently use neutral venues; home/away/neutral labels and the venue-side selector are hidden. Migration 004 updates existing imported titles/opponents and neutralizes existing venues without changing event IDs or manual event titles.

Source-managed matches have no human author and cannot be edited/deleted via ordinary event RPCs. Coaches and admins can use “Rediger tittel” to save a title override with optimistic concurrency checks; imports preserve that title while updating the other source fields. Coaches can still create and publish their lineups. RLS and existing approved-account reads remain in effect; only `service_role` can call the import RPCs. Import does not emit bulk notifications. The regular events query keeps its short local cache for manual edits, with a five-minute background refresh for a continuously open page.

The normal demo stays fictional. To try live match import **into its disposable local database**, run `VOLLEYBALL_MATCH_SYNC_ENABLED=1 npm run dev`. The launcher always supplies its own random local secret key and loopback database URL, overriding hosted credentials. Open Terminliste to trigger import; restart to discard demo changes. Tests use captured API fixtures and an isolated database, with no production fetch/browser scraping or secret embedded in fixtures.

## Tests

`tests/volleyball-matches.test.ts` verifies the captured 72-match response, exact selection of 16 fixtures, aliases, Norwegian dates, unknown times, score orientation, publication flags and malformed data. `tests/volleyball-sync-database.test.ts` executes the migration and import RPCs in PostgreSQL/PGlite, checking grants, five-minute cooldowns and leases, upserts, rollback, missing matches, and lineup preservation. `tests/volleyball-sync.test.ts` covers transport failures and cron authentication. `tests/e2e/volleyball-matches.spec.ts` exercises the real import RPCs, private schedule/detail screens and saved lineups on desktop/mobile.
