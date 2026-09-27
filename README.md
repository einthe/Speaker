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

Open http://127.0.0.1:3000. The demo includes three labelled fictional matches, with no backend or account setup.

For an empty workspace where you add matches manually:

```sh
npm run dev:manual
```

No environment file is needed. Optionally set `SPEAKER_DEMO=1` to show fictional fixtures when using `dev:manual` or a production build.

## Build

```sh
npm run build
npm start
```

## External data

No live match source is connected yet. Removing Supabase does not fetch live fixtures or rosters automatically. A future integration can fetch data from an external API on the Next.js server and pass it to the existing workspace; a database is not required for that. Availability of fixtures, rosters, captains and lineups depends on what the source provides. Manual editing remains available for missing information.

The `supabase/` directory contains historical SQL/configuration only. It is not used by the app, development server or tests. No migrations or hosted database changes are needed.

## Checks

```sh
npm run check
npm run test:e2e:local
npm run format:check
```

Tests cover announcement order, lineup selection, Oslo dates, editing, reload reset, dark mode, collapsible panels, accessibility and an empty workspace with no authentication or database backend.
