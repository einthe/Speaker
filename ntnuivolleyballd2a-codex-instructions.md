# NTNUi Volleyball D2A — Codex Implementation Specification

**Target domain:** `ntnuivolleyballd2a.no`  
**Repository:** GitHub  
**Deployment target:** Vercel-compatible  
**Backend:** Supabase  
**Primary UI language:** Norwegian Bokmål  
**Code/database language:** English  
**Theme:** Dark mode for V1  
**Product scope:** Private website for one volleyball team

---

## 1. Product purpose

`ntnuivolleyballd2a.no` is a private team website for one NTNUi volleyball team.

The application should make it easy for approved team members to:

- read and create team posts;
- publish posts in the context of a team responsibility/secondary role;
- view the team schedule;
- create schedule events when their role permits it;
- view the current roster and relevant player information;
- let coaches manage volleyball positions;
- let admins manage accounts, roles, jersey numbers, and site settings;
- let coaches create graphical starting-lineup posts for upcoming matches;
- preserve historical posts, events, match lineups, and snapshots;
- later support integrations such as Spond without requiring a rewrite of the core application.

This is a **single-team application**.

Do not build a multi-club, multi-team, multi-tenant, or federation-management system in V1.

---

## 2. Core V1 principles

1. The site is private.
2. Every normal user must authenticate.
3. New registrations require admin approval.
4. Approved users have exactly one base role: `admin`, `coach`, or `player`.
5. `admin` is a protected technical role and cannot be assigned from the UI.
6. Players may have zero or more secondary team roles.
7. Secondary roles are independent of the base role.
8. Volleyball positions are player data, **not authorization roles**.
9. Authorization must be enforced server-side/database-side, not only by hiding UI.
10. Historical content should remain stable even when a user's current role, name, jersey number, or volleyball position changes.
11. Keep V1 concrete and understandable. Do not create an unnecessarily generic CMS or plugin architecture.
12. Keep extension points clean enough for future pages, event categories, notifications, media, and Spond import.

---

## 3. V1 technical stack

### Frontend

Use:

- TypeScript;
- React;
- Next.js;
- preferably the Next.js App Router;
- responsive desktop/mobile layout;
- dark mode only for V1;
- one consistent styling/design-system approach;
- accessible semantic HTML;
- runtime validation for all untrusted input.

Prefer simple, readable UI over unnecessary visual complexity.

### Backend

Use:

- Supabase;
- PostgreSQL;
- Supabase Auth;
- PostgreSQL Row Level Security;
- Supabase Storage for post images;
- version-controlled SQL/database migrations.

Use one central Supabase project.

### Authentication

Use Supabase email + password authentication.

Use normal secure Supabase session persistence.

### Validation

Use Zod or an equivalent runtime-validation library.

Do not rely only on TypeScript types for:

- registration/profile input;
- post input;
- event input;
- role assignment input;
- lineup input;
- notification configuration;
- uploaded-file metadata.

### Repository/deployment

- Source code lives in GitHub.
- The app must deploy cleanly to Vercel.
- Do not unnecessarily couple application logic to Vercel-specific services.
- Include environment-variable documentation.
- Include local-development setup instructions.
- Include Supabase migration/setup instructions.
- Never expose Supabase service-role credentials to browser code.

---

## 4. Language and locale

### User-facing language

All normal UI text should be Norwegian Bokmål.

Examples:

- Feed: `Innlegg`
- Schedule: `Terminliste`
- Roster: `Lag`
- Coach: `Trener`
- Player: `Spiller`
- Captain: `Kaptein`
- Vice captain: `Visekaptein`
- Pending approval: `Venter på godkjenning`

Exact wording may be refined during implementation, but the UI must be Norwegian.

### Internal language

Keep the following in English:

- database table names;
- database column names;
- enum values;
- TypeScript types;
- variable/function names;
- API/service names;
- tests;
- developer-facing comments and technical documentation.

### Time and date

- Store timestamps in UTC.
- Display dates/times in Norwegian formatting.
- Default team timezone: `Europe/Oslo`.
- Handle daylight-saving time correctly.
- Use locale-aware formatting such as `nb-NO`.

---

## 5. Private-site access model

The site is private.

Unauthenticated users may access only the authentication/account-entry flow, such as:

- sign up;
- sign in;
- password recovery where supported.

Unauthenticated visitors must **not** be able to read:

- feed posts;
- schedule events;
- roster;
- player data;
- lineup graphics;
- uploaded images.

Pending, rejected, and disabled accounts must also be blocked from normal application data.

---

## 6. Account lifecycle

Use these account states:

```text
pending
approved
rejected
disabled
```

Role and account status are separate concepts.

### Registration flow

1. User opens the registration page.
2. User enters:
   - full name;
   - email;
   - password.
3. Jersey number is **not required** during registration.
4. Volleyball position is **not required** during registration.
5. Supabase Auth account is created.
6. A profile is created with:
   - `account_status = pending`;
   - no approved base role yet.
7. User is shown a Norwegian waiting-for-approval page.
8. Admin reviews the request.
9. Admin chooses either:
   - `player`, or
   - `coach`.
10. Admin approves or rejects the account.
11. An approved account can use the normal app.
12. A rejected or disabled account cannot use normal app functionality.

### Approved-role invariant

A pending account may temporarily have no base role.

Every **approved** account must have exactly one base role.

---

## 7. Base roles

Base-role enum:

```text
admin
coach
player
```

Norwegian UI labels:

```text
admin  -> Administrator
coach  -> Trener
player -> Spiller
```

A user cannot hold more than one base role.

Invalid combinations include:

```text
player + coach
player + admin
coach + admin
```

### Admin role protection

The `admin` base role must **never** be assignable from the application UI.

The UI for approving/changing normal users may only offer:

```text
player
coach
```

Creating/promoting an admin must require a direct database/secure administrative operation outside the normal UI.

Document the bootstrap process clearly.

Do not create any browser-accessible "make admin" endpoint.

---

## 8. Secondary player roles

Secondary roles are separate from base roles.

Only approved users with `base_role = player` may hold these roles.

V1 secondary-role keys and Norwegian labels:

```text
captain                    -> Kaptein
vice_captain               -> Visekaptein
social_media_manager       -> SoMe
team_manager               -> Oppmann
travel_coordinator         -> Reiseansvarlig
social_coordinator         -> Sosialansvarlig
financial_manager          -> Økonomiansvarlig
volunteer_work_coordinator -> Dugnadsansvarlig
```

A player may have:

- no secondary roles;
- one secondary role;
- several secondary roles at the same time.

Examples:

```text
player + captain
player + team_manager
player + captain + social_media_manager
```

### Assignment permissions

Only admin may assign or remove secondary roles.

### V1 uniqueness assumption

Do **not** hard-code that there may only be one holder of a given secondary role.

The data model should permit more than one player to hold a secondary role.

The team can simply assign one person in practice when that is the intended organization.

This is a reversible V1 choice and avoids unnecessary database restrictions.

### Base-role changes

If an admin changes a user from `player` to `coach`:

- all active secondary player-role assignments must be removed/deactivated transactionally;
- the user must stop receiving player-only schedule permissions;
- historical posts/events must retain snapshots of old role context where relevant.

If a coach is later changed to player, the admin may assign player-specific information again.

---

## 9. Player volleyball positions

Volleyball position is profile/team data, not an authorization role.

Use internal English keys:

```text
outside_hitter
middle_blocker
opposite
setter
libero
```

Use these Norwegian UI labels exactly:

```text
outside_hitter  -> Kant
middle_blocker  -> Midt
opposite        -> Dia
setter          -> Legger
libero          -> Libero
```

### Multiple positions

A player may have:

- one primary position;
- zero or more secondary positions.

Example:

```text
Primary: Kant
Secondary: Dia
```

Enforce at most one primary position per player.

### Position-management permissions

- Coach may assign/change player positions.
- Admin may assign/change player positions.
- Players may not assign their own positions.

---

## 10. Jersey numbers

Player jersey number:

- is optional during registration;
- may initially be `null`;
- is assigned/managed by admin;
- should be an integer;
- should be unique among currently represented player records when non-null.

V1 may use a practical range such as `0–99`, but keep validation isolated so the range can be changed later.

Do not use jersey number as a primary key or permanent identity.

Historical lineup snapshots must keep the jersey number that was displayed when the lineup version was published.

---

## 11. Admin permissions

Admin has full application control.

Admin can at minimum:

- view pending registration requests;
- view the registration email in the admin area only;
- approve registrations;
- reject registrations;
- disable users;
- re-enable users;
- assign/change a normal user's base role between `player` and `coach`;
- assign/remove player secondary roles;
- assign/change player jersey numbers;
- assign/change player volleyball positions;
- edit relevant user profile fields;
- create normal posts;
- edit/delete any post;
- remove inappropriate images;
- create/edit/delete any schedule event;
- create/edit/publish lineups;
- manage all lineup data;
- manage notification settings;
- view necessary operational/admin data;
- perform every action a coach can perform.

The admin account itself is not shown in the roster.

---

## 12. Coach permissions

Coach can at minimum:

- read the full private feed;
- create normal posts;
- edit/delete their own normal posts;
- view the schedule;
- create and manage matches;
- create and manage practices;
- enter/update match results;
- assign player volleyball positions;
- create lineup drafts for matches;
- publish/update match lineups;
- view the roster.

Coach may **not**:

- approve accounts;
- assign base roles;
- assign secondary player roles;
- change jersey numbers unless this requirement is changed later;
- promote admins;
- change global notification configuration;
- edit/delete arbitrary posts belonging to other users.

---

## 13. Player permissions

Every approved player can:

- read the feed;
- create normal posts;
- edit/delete their own posts;
- optionally publish a post using one of their current secondary-role contexts;
- view the schedule;
- view the roster;
- view lineup posts;
- perform additional schedule/event actions granted by their secondary roles.

An ordinary player with no relevant secondary role cannot create restricted schedule events.

---

## 14. Registration/profile privacy

Normal users must never see other users' email addresses.

Do not store a redundant public email column in the normal roster-facing profile model if it can be avoided.

Email belongs primarily to Supabase Auth.

The admin may view email addresses in the secure admin user-management flow because they are relevant to reviewing registrations.

Passwords must never be readable by the application or admin.

Never log:

- passwords;
- auth tokens;
- refresh tokens;
- service-role credentials.

---

## 15. Main navigation and V1 pages

V1 main navigation contains only:

1. `Innlegg`
2. `Terminliste`
3. `Lag`

Do not make the navigation architecture so rigid that additional sections become difficult later.

### Suggested routes

```text
/feed
/schedule
/roster
```

Authentication/support routes may include:

```text
/auth/sign-in
/auth/sign-up
/auth/pending
/auth/rejected
```

Supporting detail routes may exist without becoming main navigation items, for example:

```text
/schedule/[id]
/posts/[id]
```

Admin functionality may live under:

```text
/admin
/admin/users
/admin/notifications
```

Admin navigation should only render for admins.

Account settings/profile controls may live in a user/avatar menu instead of becoming a fourth main navigation section.

---

## 16. Feed

The feed is the main page after authentication.

Requirements:

- show newest posts first;
- use pagination or incremental loading;
- preserve historical posts;
- clearly show author;
- clearly show author/base-role label;
- clearly show publication time;
- support normal posts;
- support role-context posts;
- support special lineup posts;
- support optional post images;
- handle edited posts gracefully.

Use a clean card-based responsive layout.

---

## 17. Normal posts

A normal post should support at least:

```text
id
author_user_id
post_type
title
body
base_role_snapshot
secondary_role_context_key nullable
secondary_role_context_label_snapshot nullable
created_at
updated_at
edited_at nullable
```

Optional media is modeled separately.

### Required content

A normal post has:

- title;
- body/content;
- author;
- timestamp;
- author's base role.

### Editing

- Author can edit their own post.
- Author can delete their own post.
- Admin can edit/delete any post.
- Coach cannot edit/delete another user's normal post merely because they are a coach.

Show a subtle `Redigert` indicator when appropriate.

### Historical role display

Store enough snapshot information that historical post context does not silently change later.

Example:

A player publishes a post as `Oppmann`.

Three months later the player is no longer Oppmann.

The old post should still display the Oppmann context it had when published.

---

## 18. Secondary-role post context

When a player has one or more secondary roles, the post form should allow the player to optionally choose one role context.

Example:

```text
[ ] Publiser som vanlig innlegg

or

Ansvarsrolle:
[ Oppmann ▼ ]
```

The user may choose **at most one** secondary-role context per post.

If no role context is selected, the post is displayed as a normal post.

If a role context is selected:

- show its Norwegian label prominently;
- apply a distinct but restrained visual treatment;
- use a role-specific badge/accent/icon or equivalent;
- keep text contrast accessible;
- do not rely only on color to communicate the role.

Examples:

- `Oppmann`
- `SoMe`
- `Reiseansvarlig`
- `Dugnadsansvarlig`

The role used must be one the author currently holds at the moment of publishing.

A removed role cannot be selected for future posts.

---

## 19. Post image uploads

V1 supports an optional image on a normal post.

Use Supabase Storage.

### Storage requirements

- use a private bucket;
- do not expose public permanent URLs for private team media;
- authorize access;
- generate signed/private access URLs as appropriate;
- validate MIME type;
- validate maximum file size;
- use generated storage paths rather than trusting user filenames;
- do not place secrets in object metadata.

Recommended V1 accepted image types:

```text
image/jpeg
image/png
image/webp
```

A reasonable V1 maximum such as 10 MB is acceptable and should be configurable.

### Future compatibility

V1 UI only needs one image per post.

Prefer a `post_media` model instead of a single hard-coded image column so multiple attachments can be added later without redesigning posts.

---

## 20. Post types

Use a clear discriminated post type.

At minimum:

```text
normal
lineup
```

Do not store lineup data as an arbitrary normal-post body.

A lineup post should reference structured lineup data and render through a dedicated lineup renderer.

---

## 21. Schedule overview

The schedule page displays team events.

Examples include:

- matches;
- practices;
- social events/parties;
- travel;
- volunteer work/dugnad;
- team logistics;
- finance/payment deadlines;
- other admin-created events.

All approved users can read all schedule events.

### Ordering

Upcoming events:

- nearest upcoming event first.

Past events:

- remain accessible;
- may be shown in a separate history/archive section;
- should not be automatically deleted.

---

## 22. Schedule event types

Use internal English event-type keys such as:

```text
match
practice
social
volunteer_work
travel
team_logistics
finance
other
```

Norwegian UI labels may be:

```text
match           -> Kamp
practice        -> Trening
social          -> Sosialt
volunteer_work  -> Dugnad
travel          -> Reise
team_logistics  -> Lag / praktisk
finance         -> Økonomi
other           -> Annet
```

Keep labels centralized so wording can be changed later without migrations.

---

## 23. Base schedule event data

Common event fields:

```text
id
event_type
title
description nullable
starts_at
ends_at nullable
location nullable
created_by_user_id
created_at
updated_at
external_source nullable
external_event_id nullable
last_synced_at nullable
```

Validation:

- `starts_at` is required;
- `ends_at`, if present, must be after `starts_at`;
- title length must be bounded;
- description length must be bounded;
- event type must be registered/allowed;
- external fields must not be user-editable unless an integration requires them.

---

## 24. Schedule creation permissions

Use role-aware schedule permissions.

### Admin

Admin can create/edit/delete every event type.

### Coach

Coach can create/manage:

```text
match
practice
```

Coaches may manage match/practice events created by other coaches.

### Captain

No additional schedule-creation permission in V1.

Captain may still create normal posts using `Kaptein` context.

### Vice captain

No additional schedule-creation permission in V1.

Vice captain may still create normal posts using `Visekaptein` context.

### Social media manager (`SoMe`)

No special schedule-creation permission in V1.

This role primarily provides post context.

### Team manager (`Oppmann`)

May create/manage:

```text
team_logistics
```

### Travel coordinator (`Reiseansvarlig`)

May create/manage:

```text
travel
```

### Social coordinator (`Sosialansvarlig`)

May create/manage:

```text
social
```

### Financial manager (`Økonomiansvarlig`)

May create/manage:

```text
finance
```

### Volunteer work coordinator (`Dugnadsansvarlig`)

May create/manage:

```text
volunteer_work
```

and may assign approved players to volunteer-work events.

### Ordinary player

May not create restricted schedule events without a qualifying secondary role.

### V1 editing rule for secondary-role events

For secondary-role-created categories, a player may edit/delete:

- events they created themselves;

Admin may edit/delete all.

This rule is intentionally conservative.

It may later be expanded so multiple holders of the same responsibility can manage one another's events.

---

## 25. Match data

A match is a specialized schedule event.

Store structured fields such as:

```text
opponent
home_away
venue nullable
team_sets nullable
opponent_sets nullable
```

`home_away` values:

```text
home
away
neutral
```

Use clear Norwegian labels in UI.

### Match result

Coach/admin may enter a simple result after/during the match, for example:

```text
NTNUI: 3
Motstander: 1
```

Detailed per-set scores are not required in V1.

Leave room for them later if desired.

---

## 26. Practice data

Practice is a schedule event.

V1 only requires normal schedule information:

- title;
- date/time;
- optional end time;
- location;
- description.

Attendance is **not** managed locally in V1.

---

## 27. Volunteer-work events

A `volunteer_work` event may include player assignments.

Example:

```text
Dugnad: Rigging av hall
Assigned:
- Player A
- Player B
- Player C
```

Assignments are not the same as RSVP/attendance.

Store assignments structurally.

At minimum:

```text
event_id
player_user_id
assigned_by_user_id
created_at
```

Only:

- admin;
- the appropriate Dugnadsansvarlig who created/manages the event

may change volunteer assignments in V1.

Assigned users can view their assignments.

---

## 28. No local attendance system in V1

Do not implement a full local RSVP/attendance workflow in V1.

The team already uses Spond for attendance.

Do not add:

```text
attending
not_attending
maybe
```

as primary local attendance features unless a later requirement explicitly asks for it.

---

## 29. Future Spond integration

The architecture should leave room for a future Spond integration that may import:

- schedule events;
- attendance data/logs.

Do **not** invent undocumented Spond API details.

Do not implement an integration unless actual API requirements/credentials are later supplied.

### Future-compatible fields

Schedule events may include generic synchronization metadata:

```text
external_source
external_event_id
last_synced_at
```

Possible future value:

```text
external_source = "spond"
```

### Integration boundary

Keep Spond import logic behind a clear adapter/service boundary.

Do not spread Spond-specific assumptions across UI components.

Imported attendance should initially be treated as display/imported source data unless explicit write-back requirements are later provided.

---

## 30. Roster

The roster page displays approved team members except admin accounts.

Show:

### Players

- full name;
- `Spiller`;
- jersey number if assigned;
- primary volleyball position;
- secondary volleyball positions if any;
- secondary team roles.

### Coaches

- full name;
- `Trener`.

Do not display:

- email addresses;
- account IDs;
- auth metadata;
- admin accounts;
- internal permission flags.

Pending, rejected, and disabled users must not appear in the roster.

---

## 31. Admin visibility rule

Admin accounts are hidden from the roster.

Admin is therefore not presented as a normal team member.

However, if admin creates a post:

- the post must show the actual admin author;
- the post may show the base-role label `Administrator`.

Hiding admin from the roster must not make admin-authored content anonymous.

---

## 32. Starting-lineup feature

Coaches and admins can create a special starting-lineup post for an upcoming match.

The lineup must be linked to exactly one match schedule event.

Normal players cannot create lineups.

### Flow

1. Coach/admin opens an upcoming match.
2. Choose `Lag kampoppstilling` or similar.
3. Create/edit a draft.
4. Select six court starters.
5. Assign each starter to rotation/court position `1–6`.
6. Optionally select a libero.
7. Preview the lineup graphic.
8. Publish.
9. The lineup becomes visible:
   - on the match;
   - as a special lineup post in the feed.
10. Historical lineup snapshot data remains available after the match.

---

## 33. Volleyball court lineup graphic

Render a proper half-volleyball-court graphic.

Conceptual layout:

```text
              NETT

        [4]   [3]   [2]

        [5]   [6]   [1]


            BANEN

Libero:
#12 Fullt navn
```

The final UI must use a real responsive court component rather than ASCII.

Each court position should show at least:

- jersey number when available;
- player name.

Optionally show the player's Norwegian volleyball-position label where it improves clarity.

### Libero

Libero is displayed **beside the court**, not as one of court positions `1–6`.

A published lineup requires exactly six unique court starters.

V1 allows zero or one libero.

If a libero is selected, that player must be unique and must not also occupy one of the six court slots in the same published lineup.

---

## 34. Lineup rotation positions vs player positions

Do not confuse these concepts:

### Player volleyball position

Examples:

```text
Kant
Midt
Dia
Legger
Libero
```

This describes the player's normal volleyball role.

### Lineup court/rotation position

Values:

```text
1
2
3
4
5
6
```

This describes where a selected starter appears in the starting rotation graphic.

A player profile position must not hard-block assignment to a court rotation slot.

The coach controls the actual starting rotation.

---

## 35. Lineup drafts and publishing

Support draft lineups.

Drafts may be incomplete.

Only coach/admin may view/edit draft data.

### Publish validation

A lineup cannot be published until:

- it belongs to a valid match;
- it has six court slots;
- slots `1–6` each have one player;
- all six court players are unique;
- optional libero is unique;
- all selected users are approved players;
- required snapshot fields can be generated.

Use runtime validation and server-side validation.

---

## 36. Lineup snapshots

Published lineups must be historical snapshots.

For every selected player, store snapshot information such as:

```text
player_user_id
full_name_snapshot
jersey_number_snapshot
primary_position_snapshot nullable
court_position nullable
is_libero
```

Why:

A player may later:

- change jersey number;
- change name;
- change volleyball position;
- leave the team;
- lose a role.

An old lineup must still display the values that were captured for that published lineup version.

Do not render old lineup identity solely from current profile values.

---

## 37. Lineup revision model

Prefer a revision/version model.

One match has one logical lineup.

That lineup may have multiple revisions/versions over time.

Example:

```text
Match
└── Lineup
    ├── Revision 1 (published, old)
    ├── Revision 2 (published, old)
    └── Revision 3 (current published)
```

Editing an already-published lineup should create/edit a new revision rather than silently mutating all historical snapshot data.

Keep previous published revisions in the database.

The feed's lineup post should render the current published revision while the database preserves older revisions for audit/history.

A simpler implementation is acceptable only if it still guarantees that past published snapshot data is not accidentally rewritten by unrelated profile changes.

---

## 38. Lineup post rendering

A lineup feed post is a special structured post.

It should show:

- opponent;
- match date/time;
- optional venue;
- coach/admin author;
- lineup court graphic;
- six starters;
- optional libero;
- publication timestamp.

The post should visually stand out from a normal text post, but remain consistent with the dark-mode design.

The lineup data itself must come from structured lineup records, not an uploaded screenshot.

---

## 39. Notifications

Build a notification subsystem in V1, but seed every notification trigger as disabled.

Admin controls global notification triggers with checkboxes/toggles.

### V1 delivery channel

Implement **in-app notifications** as the functioning V1 channel.

Do not require email, SMS, or browser push in V1.

Keep the notification service structured so more delivery channels can be added later.

A notification center may be implemented as a bell/dropdown and does not need to become a fourth main navigation page.

### Initial state

All notification rules are `OFF`.

No notifications should be generated until admin enables the corresponding rule.

### Suggested trigger keys

At minimum support configuration for:

```text
normal_post_created
role_context_post_created
match_created
match_updated
practice_created
practice_updated
lineup_published
social_event_created
travel_event_created
team_logistics_event_created
finance_event_created
volunteer_event_created
volunteer_assignment_created
```

The implementation may consolidate similar triggers if the admin UI remains understandable.

### Recipients

Reasonable V1 defaults:

- general new/updated team content -> all approved team users;
- volunteer assignment -> specifically assigned player(s);
- lineup publication -> all approved team users;
- schedule changes -> all approved team users.

Do not notify the triggering user about their own action unless doing so is useful and intentional.

### Notification records

A notification should support:

```text
id
user_id
trigger_key
title
body
target_type nullable
target_id nullable
created_at
read_at nullable
```

Users can mark notifications as read.

---

## 40. Notification admin settings

Admin-only configuration screen.

Each notification trigger has at least:

```text
trigger_key
enabled
updated_at
updated_by
```

All seeded with:

```text
enabled = false
```

Ordinary users cannot change global notification behavior.

Do not put notification authorization only in React.

---

## 41. Recommended database entities

Exact naming may follow repository conventions, but preserve these semantics.

### `profiles`

Suggested fields:

```text
id UUID PK references auth.users
full_name
base_role nullable
account_status
created_at
updated_at
approved_at nullable
approved_by nullable
```

Do not include normal publicly readable email here unless technically necessary.

Constraints:

- base role enum is `admin | coach | player`;
- approved users require a non-null base role;
- normal UI cannot assign `admin`.

### `player_profiles`

Suggested fields:

```text
user_id UUID PK/FK -> profiles.id
jersey_number nullable
created_at
updated_at
```

Only meaningful for player accounts.

### `player_positions`

Suggested fields:

```text
id
player_user_id
position_key
is_primary
assigned_by
created_at
updated_at
```

Constraints:

- allowed position keys only;
- one `(player_user_id, position_key)` row;
- at most one `is_primary = true` per player.

### `player_secondary_roles`

Suggested fields:

```text
id
player_user_id
role_key
assigned_by
created_at
```

Unique:

```text
(player_user_id, role_key)
```

### `posts`

Suggested fields:

```text
id
author_user_id
post_type
title nullable for structured types if justified
body nullable for structured types
base_role_snapshot
secondary_role_context_key nullable
secondary_role_context_label_snapshot nullable
lineup_id nullable
created_at
updated_at
edited_at nullable
```

Normal posts require title/body.

Lineup posts require a lineup reference and use structured rendering.

### `post_media`

Suggested fields:

```text
id
post_id
storage_path
media_type
mime_type
size_bytes
created_at
```

V1 UI limits normal posts to one image.

### `schedule_events`

Suggested fields:

```text
id
event_type
title
description nullable
starts_at
ends_at nullable
location nullable
created_by_user_id
created_at
updated_at
external_source nullable
external_event_id nullable
last_synced_at nullable
```

### `match_details`

Suggested one-to-one fields:

```text
event_id PK/FK
opponent
home_away
venue nullable
team_sets nullable
opponent_sets nullable
```

If `venue` duplicates general `location`, choose one canonical field and document it.

### `volunteer_assignments`

Suggested fields:

```text
id
event_id
player_user_id
assigned_by_user_id
created_at
```

Unique:

```text
(event_id, player_user_id)
```

### `lineups`

Suggested fields:

```text
id
match_event_id unique
created_by_user_id
created_at
updated_at
```

### `lineup_revisions`

Suggested fields:

```text
id
lineup_id
revision_number
status
created_by_user_id
created_at
published_at nullable
is_current_published
```

Status examples:

```text
draft
published
```

### `lineup_revision_slots`

Suggested fields:

```text
id
lineup_revision_id
player_user_id
court_position nullable
is_libero
full_name_snapshot nullable until publish
jersey_number_snapshot nullable until publish
primary_position_snapshot nullable until publish
```

For a draft, snapshot fields may be created/updated during preview.

On publish, freeze them for that revision.

### `notification_rules`

Suggested fields:

```text
trigger_key PK
enabled
updated_by nullable
updated_at
```

### `notifications`

Suggested fields:

```text
id
user_id
trigger_key
title
body
target_type nullable
target_id nullable
created_at
read_at nullable
```

---

## 42. Database indexing

Add indexes for common access patterns.

At minimum consider:

### Profiles

```text
account_status
base_role
full_name
```

### Posts

```text
created_at DESC
author_user_id
post_type
secondary_role_context_key
```

### Schedule

```text
starts_at
event_type
created_by_user_id
external_source + external_event_id
```

### Player data

```text
player_user_id
role_key
position_key
jersey_number
```

### Lineups

```text
match_event_id
lineup_id + revision_number
is_current_published
```

### Notifications

```text
user_id + created_at DESC
user_id + read_at
```

---

## 43. Row Level Security and authorization

Security must be enforced in database/server layers.

Do not use UI visibility as the security boundary.

### General approved-user rule

Normal app data may only be read by authenticated users whose profile is:

```text
account_status = approved
```

### Profiles/roster

Approved users may read only the safe roster fields they need.

They must not gain access to auth email data.

Admin accounts should be filtered from normal roster queries.

### Posts

Approved users may read posts.

Approved users may create posts for themselves.

A user may edit/delete their own normal posts.

Admin may edit/delete any post.

A user cannot forge:

- another author ID;
- another base-role snapshot;
- a secondary-role context they do not hold.

### Player roles

Only admin may mutate secondary-role assignments.

### Jersey number

Only admin may mutate jersey number.

### Player volleyball positions

Coach/admin may mutate volleyball-position assignments.

### Schedule

Read: all approved users.

Create/update/delete: enforce event-type permission matrix server-side.

Do not trust a client-supplied statement such as:

```text
"I am Dugnadsansvarlig"
```

Check the database role assignment.

### Lineups

Read published: all approved users.

Read drafts: coach/admin only.

Create/edit/publish: coach/admin only.

### Notifications

Users can read/update read-state only for their own notification rows.

Admin alone can change global notification rules.

### Service role

Supabase service-role secret must never enter browser bundles.

---

## 44. Authorization helper design

It is acceptable to implement small reusable database/server helpers such as:

```text
is_approved_user(user_id)
has_base_role(user_id, role)
has_secondary_role(user_id, role)
can_manage_schedule_event(user_id, event_type)
is_admin(user_id)
is_coach_or_admin(user_id)
```

Keep helpers understandable.

If using PostgreSQL `SECURITY DEFINER` functions:

- use them sparingly;
- set safe `search_path`;
- review privilege grants carefully;
- test them.

---

## 45. Input validation

Validate at least:

### Registration/profile

- full name;
- email format through auth;
- account state transitions;
- base-role values;
- jersey number;
- position keys;
- secondary-role keys.

### Posts

- post type;
- title length;
- body length;
- role-context authorization;
- media MIME type;
- media size;
- lineup references.

### Schedule

- event type;
- title;
- description;
- date/time;
- end after start;
- opponent;
- home/away;
- match result;
- creator permissions;
- volunteer assignments.

### Lineups

- valid match;
- exactly six unique court starters on publish;
- positions `1–6`;
- optional unique libero;
- selected accounts are approved players;
- snapshot creation;
- revision rules.

### Notifications

- known trigger keys;
- admin-only global mutation;
- valid target references.

---

## 46. Post/feed snapshots

Store snapshots only where they solve a real historical-display problem.

Useful snapshots include:

- author's base-role label/key at publication;
- selected secondary-role context;
- lineup player name/number/position at lineup publication.

Do not unnecessarily duplicate every live profile field into every post.

---

## 47. Deactivation and historical content

Prefer disabling accounts rather than hard-deleting them in V1.

When a user becomes `disabled`:

- they cannot sign into/use normal app functionality;
- they disappear from active roster;
- their historical posts remain;
- their historical schedule events remain;
- historical lineup snapshots remain.

Do not cascade-delete team history merely because an account is disabled.

Hard account deletion is not a V1 admin workflow unless explicitly added later.

---

## 48. Admin user-management UI

Provide a clear admin interface.

### Pending requests

Show:

- full name;
- email;
- request date;
- approve/reject controls;
- base-role selector with only:
  - `Spiller`;
  - `Trener`.

Do not display `Administrator` as an assignable option.

### Approved users

Allow admin to:

- disable/re-enable;
- change player/coach base role;
- edit jersey number for players;
- assign/remove secondary roles for players;
- inspect current positions;
- change positions because admin has full control.

### Role-change warnings

If changing a player to coach, warn that player-only secondary roles will be removed.

Perform the change transactionally.

---

## 49. Coach roster controls

On the roster/player detail UI, coach may edit:

- primary volleyball position;
- secondary volleyball positions.

Coach cannot edit:

- base role;
- secondary responsibility roles;
- jersey number;
- account status.

Admin may edit all of the above where allowed.

---

## 50. Feed UX

### Desktop

Use a centered readable content column or restrained two-column layout if useful.

Do not make posts unnecessarily wide.

### Mobile

- cards stack vertically;
- images resize correctly;
- role badges remain readable;
- lineup court remains usable;
- touch targets remain large enough.

### Loading states

Provide:

- skeleton/loading state;
- empty feed state;
- error state;
- retry where appropriate.

### Newest-first rule

Use a deterministic order:

```text
created_at DESC, id DESC
```

or equivalent.

---

## 51. Schedule UX

Schedule page should make upcoming events easy to scan.

Possible grouping:

```text
Denne uken
Senere
Tidligere
```

or by month.

Use event-type icons/badges in addition to text.

Do not rely only on color.

Match cards should emphasize:

- opponent;
- date/time;
- home/away;
- result when available.

Volunteer-work cards may emphasize:

- assignment status;
- assigned players.

---

## 52. Roster UX

Players and coaches should be visually distinguishable.

Possible player card:

```text
#8 Ola Nordmann
Kant
Kaptein · Oppmann
```

Possible coach card:

```text
Kari Nordmann
Trener
```

For a player with multiple volleyball positions:

```text
Primær: Kant
Sekundær: Dia
```

Do not show email.

Do not show admin.

---

## 53. Dark-mode design principles

V1 is dark mode only.

Prioritize:

- readability;
- clear hierarchy;
- low visual clutter;
- accessible contrast;
- large enough touch targets;
- consistent spacing;
- restrained shadows/borders;
- clear role badges;
- readable court graphics.

Use centralized design tokens/CSS variables.

Team/brand colors are not fully specified in this document.

Do not hard-code role accents throughout components.

Create a centralized role/event visual mapping so colors can be changed later.

---

## 54. Accessibility

At minimum:

- semantic HTML;
- correct heading hierarchy;
- proper form labels;
- keyboard-accessible controls;
- visible focus states;
- sufficient contrast;
- accessible error messages;
- descriptive button text;
- alt text for uploaded post images where practical;
- lineup graphic accompanied by a text/list representation for screen-reader and small-screen accessibility.

Do not make the court graphic the only way to understand the lineup.

Example accessible lineup list:

```text
Posisjon 1: #8 Ola Nordmann
Posisjon 2: #4 Kari Example
...
Libero: #12 Example Name
```

---

## 55. Error handling

Handle at least:

- expired session;
- pending account attempting app access;
- disabled account;
- failed image upload;
- failed post save;
- unauthorized role context;
- unauthorized schedule event type;
- duplicate jersey number;
- invalid player position;
- invalid lineup;
- missing/deleted match;
- stale lineup revision;
- failed notification generation;
- malformed imported external metadata.

Show user-friendly Norwegian messages.

Keep technical details in secure logs.

---

## 56. Optimistic UI

Optimistic updates are allowed where helpful.

However:

- failed writes must roll back;
- user must receive clear success/error feedback;
- do not optimistically show an unauthorized action as final.

Post creation and notification read-state are reasonable candidates.

Lineup publication should prefer confirmed server success before presenting as published.

---

## 57. Audit-sensitive actions

At minimum, preserve enough timestamps/metadata to determine:

- who approved a user;
- who assigned a secondary role;
- who assigned a player position;
- who created an event;
- who assigned a volunteer;
- who created/published a lineup revision;
- who changed notification settings.

A full enterprise audit-log system is not required in V1.

A small `audit_log` table is acceptable if it simplifies accountability, but do not over-engineer it.

---

## 58. Image/media security

Uploaded media is private team data.

Do not:

- use a public Supabase bucket;
- place service-role secrets in client code;
- trust a file extension as MIME validation;
- execute uploaded files;
- allow arbitrary HTML/SVG uploads in V1.

If image transformation is added later, keep the original authorization rules.

---

## 59. Data fetching and application boundaries

Prefer a clear layering such as:

```text
React/UI
  ↓
validated server action / route handler / service
  ↓
domain authorization
  ↓
Supabase repository/query
  ↓
PostgreSQL + RLS
```

Do not put all business rules directly into React components.

Examples of business/domain functions:

```text
approveRegistration()
assignSecondaryRole()
assignPlayerPosition()
createPost()
createScheduleEvent()
canCreateScheduleEvent()
createLineupDraft()
publishLineupRevision()
updateNotificationRule()
```

---

## 60. Runtime types / reference models

Illustrative only; exact implementation may differ.

```ts
type BaseRole = "admin" | "coach" | "player";

type AccountStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disabled";

type SecondaryRole =
  | "captain"
  | "vice_captain"
  | "social_media_manager"
  | "team_manager"
  | "travel_coordinator"
  | "social_coordinator"
  | "financial_manager"
  | "volunteer_work_coordinator";

type VolleyballPosition =
  | "outside_hitter"
  | "middle_blocker"
  | "opposite"
  | "setter"
  | "libero";

type ScheduleEventType =
  | "match"
  | "practice"
  | "social"
  | "volunteer_work"
  | "travel"
  | "team_logistics"
  | "finance"
  | "other";

type PostType = "normal" | "lineup";
```

Norwegian display labels must live outside these domain keys.

---

## 61. Central translation/display mappings

Use centralized mappings rather than scattering strings.

Conceptually:

```ts
const BASE_ROLE_LABELS = {
  admin: "Administrator",
  coach: "Trener",
  player: "Spiller",
};

const SECONDARY_ROLE_LABELS = {
  captain: "Kaptein",
  vice_captain: "Visekaptein",
  social_media_manager: "SoMe",
  team_manager: "Oppmann",
  travel_coordinator: "Reiseansvarlig",
  social_coordinator: "Sosialansvarlig",
  financial_manager: "Økonomiansvarlig",
  volunteer_work_coordinator: "Dugnadsansvarlig",
};

const VOLLEYBALL_POSITION_LABELS = {
  outside_hitter: "Kant",
  middle_blocker: "Midt",
  opposite: "Dia",
  setter: "Legger",
  libero: "Libero",
};
```

Do not use Norwegian labels as database identifiers.

---

## 62. Role-specific post visuals

Create centralized visual metadata for secondary roles.

Example shape:

```ts
type RoleVisual = {
  label: string;
  badgeVariant: string;
  iconKey?: string;
};
```

Do not make authorization depend on a CSS class or badge variant.

Visual metadata is presentation only.

---

## 63. Authentication route protection

Use appropriate Next.js/Supabase route protection.

Requirements:

- unauthenticated -> sign-in;
- pending -> pending page;
- rejected -> rejected/account-state page;
- disabled -> blocked/account-state page;
- approved -> normal application.

Do not rely exclusively on client-side redirects.

Server-side data access must still enforce authorization.

---

## 64. Registration trigger/profile creation

Prefer a reliable database/auth integration for creating the initial profile after signup.

The profile should default to:

```text
account_status = pending
base_role = null
```

Do not trust a registration request that supplies:

```text
base_role = admin
```

or any other privileged value.

Ignore/reject privileged role fields from public registration input.

---

## 65. Admin bootstrap

Document how the first admin is created.

Acceptable approach:

1. create/register the intended account;
2. use Supabase SQL Editor or another secure database-admin path;
3. set the profile to:
   - `base_role = admin`;
   - `account_status = approved`.

The normal application must not expose this capability.

Include a clearly documented SQL example using a placeholder UUID/email lookup process, but do not hard-code real credentials.

---

## 66. Testing requirements

Include automated tests for important domain and authorization behavior.

### Authentication/account tests

Test:

- sign-up creates pending profile;
- pending user is blocked;
- rejected user is blocked;
- disabled user is blocked;
- admin can approve;
- approved user gains access;
- approval requires `player` or `coach`;
- admin cannot be assigned through normal UI/API.

### Base-role tests

Test:

- approved user has one base role;
- player cannot also be coach;
- player cannot become admin through normal mutation;
- changing player to coach removes player-only secondary roles.

### Secondary-role tests

Test:

- admin can assign role to player;
- ordinary user cannot assign role;
- coach cannot assign role;
- role cannot be assigned to coach;
- player may hold multiple secondary roles;
- removed role cannot be used for new role-context posts.

### Jersey tests

Test:

- jersey optional;
- admin can assign;
- unauthorized user cannot assign;
- duplicate non-null jersey rejected.

### Volleyball-position tests

Test:

- coach can assign;
- admin can assign;
- player cannot self-assign;
- at most one primary position;
- multiple secondary positions allowed;
- only known position keys accepted.

### Post tests

Test:

- all approved users can create normal post;
- newest-first query;
- author can edit own;
- user cannot edit another user's;
- admin can moderate any post;
- role-context post requires current assigned role;
- one role context maximum;
- historical role-context snapshot remains after role removal;
- private image authorization.

### Schedule tests

Test each permission:

- admin -> all event types;
- coach -> match/practice;
- Oppmann -> team logistics;
- Reiseansvarlig -> travel;
- Sosialansvarlig -> social;
- Økonomiansvarlig -> finance;
- Dugnadsansvarlig -> volunteer work;
- ordinary player -> denied for restricted event creation.

Also test:

- all approved users can read schedule;
- invalid end time rejected;
- match result update permission;
- volunteer assignment permission.

### Lineup tests

Test:

- only coach/admin create draft;
- draft may be incomplete;
- publish requires slots 1–6;
- duplicate starter rejected;
- duplicate libero/starter rejected;
- invalid account rejected;
- lineup linked to match only;
- snapshot fields frozen on published revision;
- changing current player jersey does not rewrite old revision;
- feed renders current published lineup.

### Notification tests

Test:

- all rules default off;
- disabled rule creates no notification;
- admin can enable;
- non-admin cannot change rule;
- enabled trigger creates expected notifications;
- user can only mark own notifications read.

### RLS tests

Where practical, test with real Supabase/Postgres policies rather than mocking all authorization.

Critical checks:

- User A cannot read pending/private admin data improperly.
- User A cannot modify User B's post.
- Player cannot forge secondary role.
- Player cannot create coach-only match.
- Normal user cannot read admin-only user-management data.
- Normal user cannot read another user's private notification rows.
- Public/anonymous user cannot read app data.

---

## 67. E2E reference flow

Automate a representative flow close to:

1. Player signs up with full name/email/password.
2. Player sees pending page.
3. Admin signs in.
4. Admin approves as `player`.
5. Admin assigns jersey number.
6. Admin assigns `captain`.
7. Coach signs in.
8. Coach assigns player primary position `outside_hitter` / `Kant`.
9. Player signs in.
10. Player sees feed/schedule/roster.
11. Player creates ordinary post.
12. Player creates a `Kaptein` role-context post.
13. Coach creates upcoming match.
14. Coach creates practice.
15. Social coordinator creates social event.
16. Volunteer coordinator creates dugnad and assigns players.
17. Coach creates lineup draft.
18. Coach selects six starters and libero.
19. Coach publishes lineup.
20. Lineup appears on match and feed.
21. Admin changes one starter's current jersey number.
22. Historical lineup still shows the snapshot number used at publication.
23. Admin enables one notification rule.
24. Trigger creates in-app notification.
25. User marks notification as read.
26. Log out.
27. Anonymous visitor cannot access feed.

---

## 68. V1 screens

### Authentication

- sign up;
- sign in;
- pending approval;
- rejected/disabled state;
- logout;
- password reset if supported by standard Supabase flow.

### Feed

- post composer;
- optional role-context selector;
- optional image;
- newest-first feed;
- normal post cards;
- lineup post cards;
- edit/delete own posts;
- admin moderation.

### Schedule

- upcoming events;
- past events;
- event detail;
- role-aware create action;
- role-aware editing;
- match result;
- lineup access;
- volunteer assignments.

### Roster

- players;
- coaches;
- jersey numbers;
- volleyball positions;
- secondary roles;
- coach position-management controls;
- admin user/team controls where appropriate.

### Admin

- pending registrations;
- account management;
- base-role assignment/change;
- secondary-role management;
- jersey management;
- notification settings.

---

## 69. Responsive behavior

Mobile is a first-class target.

On narrow screens:

- feed cards stack;
- images scale;
- schedule cards remain readable;
- roster cards stack;
- role badges wrap gracefully;
- admin forms remain usable;
- lineup court scales without horizontal overflow;
- accessible lineup text is shown below/beside graphic;
- modal/dialog content remains scrollable.

Desktop may use wider layouts where helpful.

---

## 70. Performance guidelines

V1 does not require advanced distributed architecture.

Use straightforward optimizations:

- paginate feed;
- query only needed roster fields;
- index schedule dates;
- index notification queries;
- avoid loading full-size images unnecessarily;
- cache static translation/config metadata;
- avoid N+1 queries for role/roster display;
- use server-side querying where it reduces client complexity.

Do not prematurely add:

- Redis;
- message queues;
- microservices;
- event buses;
- separate backend services

unless a concrete requirement appears.

---

## 71. Logging and observability

Log operational errors without leaking private data.

Do not log:

- passwords;
- tokens;
- private image URLs unnecessarily;
- entire auth payloads.

Useful logs:

- failed authorized mutations;
- image-upload failures;
- notification job failures;
- lineup publish validation failures;
- external integration errors when Spond is added later.

---

## 72. V1 non-goals

Do not spend significant V1 effort on:

- public pages;
- public roster;
- public posts;
- multi-team support;
- multi-club support;
- comments;
- emoji reactions;
- chat/messaging;
- local attendance/RSVP system;
- Spond API integration before API details are provided;
- email notifications;
- SMS notifications;
- browser push notifications;
- light mode;
- arbitrary user-defined roles;
- arbitrary user-defined event types;
- arbitrary custom CSS;
- arbitrary executable code stored in database;
- native mobile apps;
- complex analytics;
- detailed volleyball statistics;
- detailed per-set match scoring;
- public share links for lineup graphics.

---

## 73. Future extension points

The architecture should leave room for:

- additional navigation sections;
- comments/reactions;
- multiple post images;
- more schedule event types;
- per-user notification preferences;
- email notifications;
- browser push;
- Spond event import;
- Spond attendance import/display;
- more detailed match results;
- per-set scores;
- player statistics;
- team documents;
- photo galleries;
- polls;
- additional player metadata;
- archived seasons;
- eventual multi-season roster history.

Do not implement these merely because they are listed.

---

## 74. Implementation principles for Codex

1. Build a working end-to-end private team site before adding abstractions.
2. Keep base roles, secondary roles, and volleyball positions separate.
3. Never trust client-supplied authorization claims.
4. Use RLS and server authorization.
5. Keep admin role unassignable from normal UI.
6. Preserve historical snapshots where current profile changes would alter old content.
7. Use structured data for schedule events and lineups.
8. Do not store lineup graphics only as images.
9. Keep Spond behind a future integration boundary.
10. Use migrations.
11. Validate serialized/user input at runtime.
12. Keep UI Norwegian and internal identifiers English.
13. Keep dark-mode UI responsive and accessible.
14. Prefer clear code over premature generic frameworks.
15. Do not disable RLS for convenience.
16. Never expose service-role credentials in browser code.
17. For unclear small details, choose the smallest reversible implementation and document the assumption.

---

## 75. Recommended implementation order

### Phase 1 — Foundation

- Next.js + TypeScript;
- dark app shell;
- Norwegian UI baseline;
- Supabase client/server setup;
- environment validation;
- migrations;
- GitHub-ready structure;
- Vercel-compatible build.

### Phase 2 — Authentication/account lifecycle

- sign up;
- sign in;
- profiles;
- pending state;
- approved/rejected/disabled;
- protected routes;
- admin bootstrap docs;
- RLS baseline.

### Phase 3 — Admin user approval

- pending requests;
- secure email display in admin;
- approve as player/coach;
- reject;
- disable/re-enable;
- role-change logic.

### Phase 4 — Player metadata

- player profiles;
- jersey numbers;
- secondary roles;
- volleyball positions;
- admin controls;
- coach position controls;
- roster.

### Phase 5 — Normal posts/feed

- posts;
- newest-first feed;
- post composer;
- edit/delete;
- role-context posts;
- historical role snapshots.

### Phase 6 — Post media

- private Supabase Storage;
- optional one-image UI;
- media authorization;
- signed/private retrieval.

### Phase 7 — Schedule

- common events;
- matches;
- practices;
- role-aware event creation;
- social/travel/logistics/finance/dugnad;
- past-event archive.

### Phase 8 — Volunteer assignments

- dugnad assignments;
- permission enforcement;
- player display.

### Phase 9 — Match lineups

- logical lineup;
- drafts;
- revision model;
- six court slots;
- libero;
- snapshot publication;
- responsive court renderer;
- match integration.

### Phase 10 — Lineup feed post

- special post type;
- structured rendering;
- current published lineup;
- accessible textual representation.

### Phase 11 — Notifications

- global notification rules;
- all rules default off;
- in-app notification records;
- notification bell;
- read state.

### Phase 12 — Hardening

- authorization tests;
- RLS tests;
- E2E;
- accessibility review;
- responsive review;
- error handling;
- security review;
- deployment documentation.

---

## 76. V1 acceptance criteria

### Accounts

1. User can register with full name, email, and password.
2. Jersey number is not required for registration.
3. Position is not required for registration.
4. New account starts pending.
5. Pending user cannot access feed/schedule/roster.
6. Admin can approve as player or coach.
7. Admin can reject.
8. Admin can disable approved account.
9. `admin` cannot be assigned from application UI.
10. Approved users have exactly one base role.

### Roles

11. Player may have multiple secondary roles.
12. Only admin can assign/remove secondary roles.
13. Coach cannot hold player secondary roles.
14. Player cannot also be coach.
15. Player cannot also be admin.
16. Secondary-role history is preserved in already-published role-context posts.

### Player information

17. Admin can assign unique jersey number.
18. Coach/admin can assign volleyball positions.
19. Player can have one primary position.
20. Player can have multiple secondary volleyball positions.
21. UI uses:
    - Kant;
    - Midt;
    - Dia;
    - Legger;
    - Libero.

### Feed

22. Every approved user can create a normal post.
23. Post contains title, content, author, role, and timestamp.
24. Post may contain one image in V1.
25. Post author can edit/delete own post.
26. Admin can moderate any post.
27. Feed is newest first.
28. Player may choose one current secondary-role context.
29. Role-context post is visually distinct.
30. Role context is historically stable.

### Schedule

31. All approved users can view schedule.
32. Upcoming events are shown chronologically.
33. Past events remain available.
34. Coach can create/manage matches and practices.
35. Oppmann can create team-logistics events.
36. Reiseansvarlig can create travel events.
37. Sosialansvarlig can create social events.
38. Økonomiansvarlig can create finance events.
39. Dugnadsansvarlig can create volunteer-work events.
40. Dugnadsansvarlig can assign players to volunteer work.
41. Ordinary player cannot create restricted schedule events.
42. Admin can manage all event types.
43. Match supports opponent, home/away, venue/location, and result.
44. No local RSVP/attendance workflow is required.

### Roster

45. Roster shows approved players/coaches.
46. Roster does not show email.
47. Roster does not show admin accounts.
48. Player displays jersey number when available.
49. Player displays volleyball positions.
50. Player displays secondary roles.
51. Coach displays as Trener.

### Lineup

52. Coach/admin can create lineup for a match.
53. Lineup can be saved as draft.
54. Published lineup has six unique court starters.
55. Court positions are exactly 1–6.
56. Optional libero appears beside court.
57. Libero cannot duplicate a court starter.
58. Published lineup stores snapshots.
59. Changing a player's current jersey number does not alter old published snapshot data.
60. Published lineup appears on match.
61. Published lineup appears as special feed post.
62. Court is rendered responsively.
63. Textual lineup representation is available for accessibility.

### Notifications

64. Notification subsystem exists.
65. Admin controls notification trigger toggles.
66. Every trigger is off by default.
67. Disabled trigger creates no notification.
68. Enabled trigger can create in-app notification.
69. Users can mark own notification as read.
70. Ordinary users cannot change global notification rules.

### Security

71. Anonymous visitor cannot read private data.
72. Pending user cannot read normal app data.
73. User cannot forge base role.
74. User cannot forge secondary role.
75. User cannot edit another user's normal post.
76. User cannot create an event type their role does not permit.
77. User cannot read another user's private notification rows.
78. Service-role secret is never sent to browser.
79. Private post images are not publicly exposed.
80. Critical RLS/authorization behavior has automated coverage.

### Deployment/code quality

81. Database changes are version-controlled migrations.
82. Runtime validation exists.
83. Setup documentation exists.
84. Environment variables are documented.
85. App builds for Vercel.
86. GitHub repository is ready for normal development workflow.
87. Critical E2E path works.

---

## 77. Suggested project structure

Exact structure may vary, but keep responsibilities clear.

Example:

```text
src/
  app/
    auth/
    feed/
    schedule/
    roster/
    admin/
  components/
    feed/
    schedule/
    roster/
    lineup/
    notifications/
    ui/
  domain/
    auth/
    roles/
    players/
    posts/
    schedule/
    lineups/
    notifications/
  lib/
    supabase/
    validation/
    i18n/
    permissions/
  server/
    services/
    repositories/
supabase/
  migrations/
  seed/
tests/
```

Do not create layers that contain no meaningful logic.

---

## 78. Seed/config data

Seed or define centrally:

- known base roles;
- known secondary roles;
- Norwegian secondary-role labels;
- volleyball positions;
- Norwegian volleyball-position labels;
- schedule event types;
- notification trigger keys;
- default notification rule state (`false`).

Do not seed real user credentials.

---

## 79. Data integrity rules summary

Enforce through database constraints and server validation where appropriate:

- approved profile -> base role required;
- base role -> one enum value only;
- secondary roles -> players only;
- jersey number -> nullable but unique when assigned;
- one primary volleyball position per player;
- event start required;
- end after start;
- match detail belongs to match event;
- volunteer assignments belong to volunteer-work event;
- lineup belongs to match;
- one court player per position 1–6 per revision;
- no duplicate player in published lineup;
- maximum one libero per published revision;
- post role-context must correspond to valid held role at publication;
- admin global settings -> admin-only mutation.

---

## 80. Security review checklist before V1 launch

Verify:

- all protected routes require approved authenticated session;
- RLS enabled on private tables;
- no accidental public storage bucket;
- no email leak in roster queries;
- no admin role assignment in normal endpoints;
- no service-role secret in client environment;
- no unrestricted `select *` from auth/admin data;
- no client-only event-permission checks;
- no direct object-reference vulnerability on posts/events/notifications;
- image paths authorized;
- lineup drafts coach/admin only;
- notification rules admin-only;
- input schemas enforce expected limits;
- production environment variables documented.

---

## 81. Deployment documentation

README/setup must include:

1. prerequisites;
2. install dependencies;
3. create Supabase project;
4. required environment variables;
5. run migrations;
6. configure Auth URL/redirect settings;
7. create/bootstrap initial admin securely;
8. configure Storage bucket/policies;
9. run locally;
10. run tests;
11. build;
12. deploy to Vercel;
13. configure `ntnuivolleyballd2a.no`;
14. verify production auth callback URLs;
15. verify RLS after deployment.

---

## 82. Final mental model

```text
                       ┌──────────────────┐
                       │  Supabase Auth   │
                       └────────┬─────────┘
                                │
                                ▼
                         Account profile
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
              Admin           Coach           Player
                │               │               │
                │               │       ┌───────┴────────┐
                │               │       ▼                ▼
                │               │  Secondary roles   Player data
                │               │   (0..many)        jersey/positions
                │               │
                └───────────────┼──────────────────────────────┐
                                │                              │
                                ▼                              ▼
                              Feed                          Schedule
                                │                              │
                     ┌──────────┴─────────┐          ┌────────┴────────┐
                     ▼                    ▼          ▼                 ▼
                Normal posts        Lineup posts   Matches       Other events
                                          │          │
                                          └────┬─────┘
                                               ▼
                                        Structured lineup
                                       + published snapshot
                                               │
                                               ▼
                                       Court graphic + libero
```

The main separation is:

- **base roles** decide broad account permissions;
- **secondary roles** give players team responsibilities and contextual permissions;
- **volleyball positions** describe players, not authorization;
- **posts** communicate information;
- **schedule events** represent structured upcoming/past activities;
- **lineups** are structured match data with historical snapshots;
- **notifications** react to selected events only when admin enables them.

---

## 83. Final instruction to Codex

Implement the application as a focused, secure, private single-team product.

Do not turn it into a generic CMS or multi-team platform.

When a small unspecified detail appears:

1. prefer the simplest reversible implementation;
2. preserve the security model;
3. preserve the role distinctions;
4. preserve historical data;
5. document the assumption.

The V1 is successful when an approved team member can sign in, read/write team posts, view the schedule and roster, use their team responsibilities appropriately, and coaches can publish a clear graphical match lineup — all with server-enforced authorization and a clean Norwegian dark-mode interface.
