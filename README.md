# NTNUI Speaker

A minimal dark speaker desk: matches on the left, a continuous scrollable script in the center, and editable team lists on the right. Use the header buttons to collapse or reopen either panel. On smaller screens, the panels open above the script.

Select up to six starters, a captain and a libero for each team. Edit names, numbers, coaches, referees and the player of the match directly; the script updates immediately. Editable values are highlighted in cyan. NTNUI is announced last; each team's libero appears last in its player list. Wording follows the supplied Speaker BK Trømsø PDF.

No login, database or Supabase connection is required. The workspace is accessible to anyone who can reach the site. Match data lives only in the current tab: switching matches keeps edits, while reloading or closing the tab discards them.

## Run locally

Use Node 24 LTS:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Upcoming NTNUI home matches in Dragvollhallen load automatically from VolleyLive, including available player lists, coaches and referees. No account or API key is needed.

For an empty workspace where you add matches manually:

```sh
npm run dev:manual
```

For three labelled fictional matches, run `npm run dev:demo`. No environment file is needed. `SPEAKER_MATCH_SOURCE=manual` disables live fetching; `SPEAKER_DEMO=1` selects fictional fixtures instead.

## Build

```sh
npm run build
npm start
```

## External data

The server uses the public data service behind [VolleyLive](https://kamper.volleyball.no/scoreboard?seasonId=201070&tournamentId=449547). It discovers the current season and the men's elite and women's first-division competitions, then filters by NTNUI's first-team IDs and Dragvollhallen's venue ID. Completed and past matches are excluded; today's unplayed matches remain available. Source times are interpreted in Europe/Oslo, including daylight saving changes.

`src/server/volleylive.ts` reads the site's public `ta/Seasons`, `ta/Tournament/Season`, `ta/TournamentMatches`, `ta/MatchTeamMembers`, `ta/TeamMembers` and `ta/MatchReferee` endpoints at `https://sf48-terminlister-prod-app.azurewebsites.net/`. These are the endpoints used by the public website, rather than a separately contracted API. Successful responses are cached for five minutes. Reloading imports again and discards local edits; there is no background refresh that overwrites an open script.

Published match rosters take priority. When unavailable, the registered team roster is shown with the label **Lagstall**. Captain and libero selections are imported only when explicitly identified in a match roster. Starting six always remain manual: neither a registered roster nor a played flag establishes the starting lineup. All imported fields remain editable. Source failures show a short message and leave manual entry available; missing fields stay blank.

The `supabase/` directory contains historical SQL/configuration only. It is not used by the app, development server or tests. No migrations or hosted database changes are needed.

## Checks

```sh
npm run check
npm run test:e2e:local
npm run format:check
```

Tests cover announcement order, lineup selection, Oslo dates, editing, reload reset, dark mode, collapsible panels, accessibility and an empty workspace with no authentication or database backend.

Import tests cover source filtering, roster fallback, partial failures and time conversion. Optional checks against the real service require network access and upcoming published fixtures:

```sh
SPEAKER_LIVE_CHECK=1 npm test -- tests/volleylive.test.ts
SPEAKER_LIVE_CHECK=1 npm run test:e2e:local
```
