# Comments and meme reactions

Every post (including published lineups) and every event has a discussion section on its detail page. Post feed cards also have comments and reactions buttons that expand the selected section in place, including commenting, replies and meme reactions. The comment box stays hidden until the user selects **Skriv kommentar**, both in the feed and on post/event details. It closes after publishing or cancelling. Feed buttons display counts only when nonzero. Discussions load when expanded, and closing the reactions section unmounts its GIFs. Clicking a post's main area opens its detail page; links, text selection, gallery controls and expanded discussions remain independent. Schedule cards continue to show nonzero discussion counts and open the event for participation. Counts include replies, exclude deleted comments, and count each member’s meme reaction separately. Approved players, coaches and admins can participate.

Comments support nested replies, connecting thread lines, links typed as normal text, and 3,000 characters per comment. Authors can edit/delete their comments; admins can delete any comment. Deletion removes the body and preserves a placeholder and its replies. Thread lines show parent/child relationships without a repeated “Svar til” label. Indentation stops growing on small screens. The database caps nesting at 64 replies; deeper conversations can continue under an earlier comment.

Reactions use GIFs selected through GIPHY, with no emoji or upload alternative. Users can select multiple different memes, once each per post/event in its gallery. Meme replies to comments are individual entries, like text replies. **Svar** and **Reager** sit together on every text or meme reply. Comment memes are individual entries in the same threaded list, with an author and date. Memes display at their full aspect ratio without cropping. They can receive text replies or further meme replies, use the same indentation and connecting lines, and have no separate hide control. **Skjul alle kommentarer** hides the whole comment thread on detail pages; closing comments in the feed does the same. Deleting a meme with text or meme replies preserves those replies beneath a placeholder; a meme without replies is removed entirely. Direct post/event reactions keep their existing gallery and show/hide controls; card reaction totals refer to that gallery. Identical memes are grouped with a count and the names of everyone who reacted displayed below each meme. Clicking a selected reaction removes your reaction. GIFs play automatically in the picker and reactions section. **Skjul reaksjoner** hides the section and unmounts its GIFs to stop playback; **Vis reaksjoner** opens it again. Comments remain visible. GIPHY availability does not affect comments.

## Setup

1. Run `npx supabase db push` for the linked project before deploying. This applies pending migrations in order without resetting data, including `202609240002_comment_reactions_and_read_all.sql` for the **Merk alle som lest** notification action and `202609240003_threaded_meme_replies.sql` for threaded comment memes. `202609240004_remove_unanswered_memes.sql` removes deleted memes without replies instead of leaving empty placeholders. Migration 003 preserves existing comment reactions and their authors/dates without replaying notifications. Existing discussions and post/event reactions are preserved.
2. Sign in at [GIPHY Developers](https://developers.giphy.com/dashboard/), create an **API** key for the web app, and add this to `.env.local`:

   ```env
   NEXT_PUBLIC_GIPHY_API_KEY=your_api_key
   ```

3. Restart `npm run dev` locally. For deployment, add the same environment variable to the hosting project's settings and rebuild/redeploy; `NEXT_PUBLIC_` values are embedded at build time.

GIPHY requires direct browser requests, so this is intentionally a public browser key, not a server secret. Do not commit `.env.local`. New beta keys are currently limited to 100 API calls/hour; check the [official quickstart and production upgrade process](https://developers.giphy.com/docs/api/) for current limits and requirements. A search, a search page, or resolving stored GIF IDs consumes API calls.

Without a configured key, comments remain available and the meme button displays as unavailable. Provider/network/rate-limit errors include retry feedback. Automated tests intercept only GIPHY browser requests; the configured local key was also verified manually with live search, image loading and reaction persistence.

## Deployment shows “Memes er ikke tilgjengelige ennå”

This specific message means the browser bundle was built without a non-empty `NEXT_PUBLIC_GIPHY_API_KEY`. It appears before any GIPHY API request, so it is not a GIPHY quota or search error.

In Vercel, open the project’s **Settings → Environment Variables** and add `NEXT_PUBLIC_GIPHY_API_KEY` with the key from your local `.env.local`. Enable **Production**, and **Preview** if you use preview deployments. Save, then **redeploy** the application. Existing deployments retain their old values; refreshing the page alone cannot update a build-time variable. Once the new deployment is ready, reload the production URL.

Reference: [Vercel environment variable setup and redeployment](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Storage and permissions

- `discussion_comments` and `meme_reactions` belong to exactly one post or event, with cascading deletion when that content is removed.
- Comment memes are stored in `discussion_comments` with a GIPHY ID instead of text. They obey the same ownership, target, depth, request-ID and deletion checks as text replies. Legacy `comment_meme_reactions` are migrated into thread entries; direct post/event `meme_reactions` remain unchanged.
- Authenticated reads require an approved account through RLS. Writes use guarded RPCs; direct table writes are denied.
- Comment parent/target consistency, ownership, version checks, body limits and reaction uniqueness are enforced in PostgreSQL, independently of the UI. New comments use request IDs to avoid duplicate submissions on retry.
- Only GIPHY IDs are persisted, never GIF URLs/files. The browser retrieves current metadata directly from GIPHY and uses media URLs unchanged. No media proxy, Next image optimization, persisted metadata cache or downloaded GIF copies are used. Search terms are sent as entered, results retain API order, and the rating is `pg-13`.
- The logo graphic is replaced by a small **Powered by GIPHY** text link in the picker and expanded reactions section to retain visible provider attribution.
- Discussion data follows account-scoped query caching, refreshes on focus and every 30 seconds while visible, and is invalidated immediately after a successful change. GIPHY metadata uses transient component state rather than the app's shared query cache.
- Post/event discussion notifications follow the admin channel settings. Meme replies follow the existing reply-notification setting and notify the parent author, excluding self-replies.
- **Merk alle som lest** in the notification menu marks all unread notifications belonging to the caller, including older rows beyond the 50 displayed. It preserves existing read timestamps, does not affect other members or email delivery, and disappears when there are no unread notifications.

## Local demo and verification

Restart `npm run dev` to apply the migration to the disposable local database. **Baneoppsett til helgen** has an example thread with nested replies, and **NTNUI – Fjordvik** has an example comment. Add your GIPHY key to test actual meme search; demo code is not included in deployment.

- `npm test`: PostgreSQL/RLS tests cover approved/unapproved access, ownership, admin moderation, stale edits, cross-target replies, idempotent requests, reaction uniqueness, nesting limits and cascading deletion. Unit tests cover thread construction and safe media URLs.
- `npm run test:e2e:local -- tests/e2e/discussions.spec.ts`: uses real app actions and a disposable PostgreSQL backend on desktop/mobile; GIPHY API/media requests alone are mocked with an explicit test-only key. Covers search, pagination, rate limits, replies, editing, links, deletion, reaction counts/removal, persistence, event discussions and provider failures.

To run the same isolated browser tests against Next development mode (including React Strict Mode), use `E2E_NEXT_DEV=1 npm run test:e2e:local -- tests/e2e/discussions.spec.ts`. This catches dialog lifecycle regressions that can differ from production builds.
