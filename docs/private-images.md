# Private image delivery

Admins can turn automatic image sizing on/off under **Administrasjon →
Bildeinnstillinger**. This is a team-wide database setting, enabled by default.
When off, avatars request the 512 px version and posts request the 2400 px version
without a responsive source set. Caching, validation and authorization stay on.
Saving refreshes the admin's session immediately; other open pages refresh their
session/settings every 30 seconds while visible, or on reload.

Apply `supabase/migrations/202609210001_image_settings.sql` for this toggle. Local
demo/test databases apply it automatically on startup. Until it is applied, image
sizing remains enabled and the app stays usable; the admin settings page offers
retry rather than pretending a setting was saved.

Post photos and avatars stay in private Supabase buckets. No public image URLs,
signed download links, or public Next image optimizer are introduced.

## Processing and sizes

Uploads retain the existing server-side size/type/pixel validation, orientation
correction, metadata stripping and WebP encoding. After upload, the server primes
Next's Data Cache with WebP variants from those validated bytes:

- Avatars: 64, 128, 256 and 512 px square.
- Posts: 480, 960, 1600 and 2400 px bounding boxes, without enlarging the source.

Private image views select a variant using their measured display width and the
screen's pixel density. The full-size admin option is still respected. Photos
are fetched as they approach the viewport, then decoded before display.
Existing/direct API uploads pass through the
same decoding and validation on their first variant request; a filename or MIME
type alone never makes uploaded bytes trusted.

## Loading and layout stability

Post photos show a palette-aware placeholder with a spinner and “Laster bilde …”
until loaded. Uploads store the dimensions of the final, orientation-corrected
image so single-image posts reserve the right aspect ratio before fetching bytes.
Older images without dimensions and multi-image galleries use a stable 4:3 frame.
Frames retain the existing 600 px height limit and contain the whole image.
Loading or failing images do not change the frame size; failed post images offer
“Prøv igjen”. Avatars and GIFs also show placeholders in their fixed-size frames.
Placeholder animations respect reduced-motion preferences.

Apply `202609230003_post_image_dimensions.sql` with `npx supabase db push` before
deploying this update. It preserves existing attachments; no image downloads or
backfill are needed. The local demo applies it automatically on restart.

## Cache layers

The **session image cache** keeps previously viewed post photos and avatars in
memory as blob URLs. Returning to a section displays the saved image immediately.
After 30 seconds, a visible image refreshes in the background on mount, focus,
reconnect, or return to the viewport. Concurrent requests for the same variant are
deduplicated. An unchanged ETag retains the same displayed image; changed bytes
are decoded before replacing it. A previously cached size can stay visible while
a larger/smaller variant is fetched. GIFs continue using GIPHY's browser delivery.

This cache belongs to one authenticated provider and is not written to localStorage,
IndexedDB, or a service worker. Sign-out, account changes, document departure and
provider teardown clear it and abort pending requests. Late responses cannot
restore cleared entries. Known photo replacements/removals invalidate saved
copies; access-denied responses clear the image cache, and missing-image responses
remove all sizes of that image. Temporary network errors keep the last photo.
Previously seen photos can remain visible until a background check discovers a
change, just like the existing cached post data. This is not instant remote erasure.

On cache activity, unused entries are pruned after 15 minutes and under a 24 MB / 128-entry budget.
Mounted images are protected from eviction, so the total can exceed that budget
while many photos are displayed; it is trimmed when those views unmount. A full
page reload starts a new session cache and uses the normal authenticated image
requests again. Existing HTTP caching can still save transferred bytes.

The **server Data Cache** stores only re-encoded image bytes. Keys include the
Supabase project, bucket kind, storage path, live storage object ID/version/ETag,
requested size and encoding version. It does not cache permission decisions,
cookies or entire authenticated HTTP responses. Normal replacement/removal
actions also expire all variant tags for the old path.

Every `/media/[id]` and `/avatars/[id]` request first checks the current account,
the current attachment record under RLS, and live Storage metadata under the
viewer's credentials. These checks use uncached requests. A removed attachment,
missing source or disabled account cannot retrieve cached bytes. A source version
change selects a new cache entry, including deletion/recreation at the same path.
Cold generation checks the source version again before storing a result.

The **browser HTTP cache** receives `private, no-cache, must-revalidate`, an ETag and
`Vary: Cookie, Authorization`. The ETag includes the viewer and encoded content.
After authorization and source checks, unchanged conditional requests receive
`304` with no body. Network reads revalidate before reuse; the separate session
cache supplies immediate display while those checks run. Failed/denied requests
use `private, no-store`.

As with any previously viewed content, browser history snapshots or files a user
has already saved cannot be remotely erased by HTTP cache policy.

## Deployment and limits

The image cache itself needs no schema migration or additional secret; the admin
toggle and dimension metadata use the migrations listed above.
Existing images are optimized on demand. Cache priming failure does not undo a
successful upload. Cache read/write failure falls back to validated processing.
Next's persistent Data Cache availability and entry-size limits depend on the
host. Evicted entries are regenerated; especially large full-size variants may
need to be regenerated when they exceed the host's cache limit. Smaller variants
and browser conditional requests still work.

Run `npm test -- tests/private-images.test.ts tests/session-images.test.ts` for cache/access regression tests,
and `npm run test:e2e:local -- tests/e2e/session-images.spec.ts tests/e2e/private-images.spec.ts tests/e2e/profile.spec.ts`
for production-build browser checks against the disposable backend.
For WebKit/iPhone-sized coverage, install `npx playwright install webkit` and run
`npx playwright test --config playwright.webkit.config.ts`. This tests WebKit,
not a physical iPhone or the complete Chrome iOS application.
