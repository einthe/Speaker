# Speaker desk

The workspace at /matches is a standalone Next.js application. It no longer uses Supabase, authentication, account profiles, a local database emulator or database credentials. Old login links redirect to the workspace.

- Left: matches ordered by scheduled time, with a manual add button.
- Center: the full scrollable script, using the supplied PDF wording and cyan highlights for dynamic values.
- Right: both rosters, starting six, captain, libero, coaches, match details, award and notes.
- Both panels can be collapsed; the theme is neutral dark.
- All changes update the script immediately in browser memory.
- NTNUI is announced last. Each team's captain is followed by its coach; each libero appears last in its player list.

Edits survive switching matches, but reset on reload. Anyone who can reach the site can open it. No shared persistence or live match feed is currently configured.

`npm run dev` shows fictional fixtures. `npm run dev:manual` starts an empty workspace. Neither requires a backend. Supabase packages and the local Auth/SQL test adapter were removed. Historical migration files are retained for reference only; no hosted project was modified.

External fixtures and rosters can be fetched server-side in a future integration without adding a database. The source and its supported data fields still need to be established.
