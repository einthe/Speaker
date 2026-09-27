# Speaker desk

The workspace at /matches is a standalone Next.js application. It no longer uses Supabase, authentication, account profiles, a local database emulator or database credentials. Old login links redirect to the workspace.

- Left: automatically imported NTNUI home matches in Dragvollhallen, ordered by scheduled time, with a manual add button.
- Center: the full scrollable script, using the supplied PDF wording and cyan highlights for dynamic values.
- Right: both rosters, starting six, captain, libero, coaches, match details, award and notes.
- Both panels can be collapsed; the theme is neutral dark.
- All changes update the script immediately in browser memory.
- NTNUI is announced last. Each team's captain is followed by its coach; each libero appears last in its player list.

Edits survive switching matches, but reset on reload. Anyone who can reach the site can open it. There is no shared persistence.

`npm run dev` imports live fixtures. `npm run dev:demo` shows fictional fixtures; `npm run dev:manual` starts an empty workspace. None requires credentials or a database. Supabase packages and the local Auth/SQL test adapter were removed. Historical migration files are retained for reference only; no hosted project was modified.

The server reads the public service used by kamper.volleyball.no. It discovers the active season and the men's elite and women's first-division competitions, then filters by stable NTNUI team and Dragvollhallen venue IDs. Available coaches, referees and match rosters populate the script. A registered team roster is used when a match roster has not been published, with a small Lagstall label. Starting six remain manual; captain and libero flags are only imported from a published match roster. Successful public responses are cached for five minutes. A failure preserves available fixtures and manual editing, with a short source message. No periodic refresh overwrites an open workspace.
