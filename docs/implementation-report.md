# Simplified speaker desk

The September 2026 simplification replaces the preparation/verification workflow with one authenticated workspace at /matches.

- Left: matches ordered by scheduled time and a manual add button.
- Center: the entire script, with normal scrolling and adjustable text size.
- Right: both rosters, starting six, captain, libero, coaches, match details, award and notes.
- All changes update the script immediately in client memory.
- NTNUI is announced last, including captains, coaches and starting lineups.
- No match database access, source providers, synchronization, cron, readiness states or verification.
- Supabase handles login and approved-user access only. All approved users can edit.
- Old preparation/script/speaker URLs redirect to the workspace.

Match edits survive switching within the workspace, but reset on reload or logout. Demo fixtures are fictional and enabled only with SPEAKER_DEMO=1 (automatically set by npm run dev). Otherwise the workspace starts empty for manual entry.

The previously generated, unapplied match-domain migration was removed. Existing historical account migrations are retained; no hosted database was changed.
