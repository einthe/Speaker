# NTNUI Volleyball Speaker Website — Codex Implementation Specification

## 1. Purpose

This application is an internal tool for **NTNUI Volleyball home-match speakers in Dragvollhallen**.

Its purpose is to:

- discover relevant upcoming NTNUI home matches;
- import relevant match, team, roster, staff, and referee information from external volleyball data sources where possible;
- store that information in Supabase so the application does not depend on external services being available on match day;
- allow an authorized user to review, correct, and verify the imported information;
- identify and verify the **starting six plus libero** for each team;
- dynamically generate the speaker script for the match;
- present that script in a large, simple, reliable Speaker Mode designed for use during the match.

This repository is derived from the existing `NTNUIVolleyballD2A` project, but this is a separate application with a much smaller and more focused product scope.

The original repository and production application must not be modified.

Existing implementations may be reused when they satisfy these requirements, but the requirements in this document take priority over functionality inherited from the old application.

---

# 2. Product Principle

The application should optimize one workflow:

```text
Login
  ↓
Upcoming relevant matches
  ↓
Select match
  ↓
Import/update available information
  ↓
Review match data
  ↓
Correct missing or incorrect information
  ↓
Verify the match
  ↓
Verify/select starting 6 + libero
  ↓
Open Speaker Mode
  ↓
Read script during match
  ↓
Choose player of the match
  ↓
Read final announcement
```

The product should remain deliberately narrow.

Do not preserve unrelated team-site functionality simply because it already exists in the original repository.

---

# 3. Supported Matches

The application initially supports only home matches played in **Dragvollhallen** for the following NTNUI teams.

## 3.1 NTNUI Women

- NTNUI women's first team
- 1. divisjon women
- home matches only
- venue: Dragvollhallen

## 3.2 NTNUI Men

- NTNUI men's first team
- Norwegian top division
- competition may be referred to as Mizunoligaen / Eliteserien
- home matches only
- venue: Dragvollhallen

The implementation must not hard-code a specific opponent or season.

Use stable external team, competition, and venue identifiers when available.

Do not rely only on display-name matching such as `"NTNUI"`.

Venue aliases may be configured for external systems that use different text representations.

Examples may include:

```text
Dragvollhallen
Dragvollhallen, Trondheim
Dragvoll Idrettssenter
```

Prefer stable venue identifiers over text matching when possible.

---

# 4. Technology to Retain

Reuse the following from the existing application where practical:

- Next.js
- React
- TypeScript
- Supabase
- Supabase authentication
- Supabase Postgres
- existing server/client Supabase setup
- existing profile/auth patterns
- Row Level Security patterns
- environment handling
- test infrastructure
- reusable UI primitives
- responsive styling infrastructure
- deployment structure
- error-handling patterns

Do not rewrite working infrastructure unless necessary.

---

# 5. Functionality to Remove

Remove product functionality that is not required for this application.

This likely includes:

- posts
- feeds
- comments
- reactions
- social functionality
- existing event-management functionality not related to imported matches
- training availability
- player availability
- tactical lineup features unrelated to the speaker workflow
- existing team roster management that is superseded by match squad import
- public team website pages
- news functionality
- notifications unrelated to speaker preparation
- generic member pages
- unrelated storage buckets
- associated database tables
- associated RLS policies
- associated API/server actions
- associated tests
- obsolete demo data

Do not merely hide obsolete functionality in the UI.

If functionality is no longer used and has no remaining dependency, remove it cleanly.

---

# 6. Authentication

Reuse Supabase authentication.

Users must authenticate before accessing protected functionality.

Keep roles simple.

## 6.1 User

Can:

- view upcoming relevant matches;
- view stored match data;
- use Speaker Mode.

## 6.2 Admin

Can additionally:

- synchronize external data;
- edit match data;
- resolve imported-data problems;
- select lineups manually;
- verify sections;
- mark a match ready;
- edit player of the match;
- manage source configuration if such management exists.

Existing roles such as player, coach, or team-specific roles should be removed unless still required during migration.

Authorization must be enforced by Supabase Row Level Security and server-side checks, not only by the frontend.

---

# 7. External Data Architecture

External volleyball data must be accessed through a provider abstraction.

The rest of the application must not depend directly on one provider's response schema.

Conceptually:

```ts
interface MatchProvider {
  getUpcomingMatches(): Promise<ExternalMatchSummary[]>;

  getMatch(
    externalMatchId: string
  ): Promise<ExternalMatch>;

  getMatchRoster(
    externalMatchId: string,
    externalTeamId: string
  ): Promise<ExternalMatchRoster | null>;

  getOfficials(
    externalMatchId: string
  ): Promise<ExternalOfficials | null>;

  getStaff?(
    externalMatchId: string,
    externalTeamId: string
  ): Promise<ExternalTeamStaff | null>;

  getStartingLineup?(
    externalMatchId: string,
    externalTeamId: string
  ): Promise<ExternalStartingLineup | null>;
}
```

`null` must mean that the provider currently has no data for that item.

It must not automatically be treated as an application error.

Example:

```text
No starting lineup published yet.
Last checked: 14:22
```

is valid application state.

Do not tightly couple UI components to provider-specific fields.

---

# 8. External Source Investigation

Before implementing the production provider, investigate which approved or public source can reliably provide:

- upcoming fixtures;
- match IDs;
- team IDs;
- venue;
- competition;
- complete match squad;
- shirt numbers;
- captains;
- coaching staff;
- referees;
- starting six;
- libero.

Do not assume DataProject provides a public API unless verified.

Do not reverse-engineer authenticated/private endpoints without confirming that their use is permitted.

If multiple providers are necessary, the application may combine them.

For example:

```text
Provider A → fixtures
Provider B → match squad
Provider C → officials
Manual     → captain correction
```

The normalized database should hide this complexity from the rest of the application.

---

# 9. Mock Provider

Implement a `MockMatchProvider` before the real production provider.

The mock provider should include several fictional fixtures and enough data to exercise the entire workflow.

It should support:

- upcoming matches;
- full match squads;
- coaches;
- captains;
- referees;
- starting six;
- libero;
- incomplete data;
- provider failure.

Tests and CI must not depend on the real external provider.

---

# 10. Match Discovery

The application should discover relevant matches according to configured supported teams.

A match is relevant when:

```text
team = configured NTNUI team
AND
NTNUI is the home team
AND
venue matches Dragvollhallen configuration
AND
competition matches the configured supported competition
```

Exclude:

- away matches;
- matches at other venues;
- unrelated NTNUI teams;
- unrelated competitions.

Prefer stable external IDs.

---

# 11. Synchronization Strategy

Speaker Mode must not fetch critical data directly from external volleyball services.

Instead:

```text
External source
      ↓
Synchronization
      ↓
Supabase
      ↓
Preparation UI
      ↓
Speaker Mode
```

Supabase is the application's operational source of truth during match preparation and match-day use.

## 11.1 Synchronization Behavior

Support:

- automatic periodic synchronization of upcoming matches;
- manual `Update from source` for admins;
- update attempt when an admin opens an upcoming match;
- synchronization of late-arriving data such as officials or starting lineups.

Do not delete stored data just because the provider temporarily returns an error.

## 11.2 Sync Metadata

Store at least:

- provider;
- external match ID;
- last successful update;
- last sync attempt;
- last sync status;
- error summary if relevant.

---

# 12. Reliability Principle

Once match data has been successfully imported, the application must remain usable even if the external provider later fails.

Required behavior:

```text
1. Match imports successfully.
2. Match data is stored locally.
3. External provider later fails.
4. User opens match.
5. Stored match remains available.
6. UI shows that external synchronization failed.
7. Speaker Mode still works from stored data.
```

This is a core requirement, not an edge case.

---

# 13. Imported, Override, and Effective Values

Important data must support three concepts:

```text
SOURCE VALUE
What the external provider most recently returned

OVERRIDE
Optional manual correction

EFFECTIVE VALUE
What the application actually uses
```

Example:

```text
Source shirt number: 10
Manual override: 12
Effective shirt number: 12
```

A later sync must not silently remove the manual override.

This pattern should be used for data that may need manual correction, including:

- player names;
- shirt numbers;
- captain;
- coaches;
- referees;
- starting lineup;
- libero.

---

# 14. Match Lifecycle

Use a simple match lifecycle.

Suggested states:

```text
DISCOVERED
Imported fixture exists.

IMPORTING
Some information is still being gathered.

NEEDS_REVIEW
Enough information exists for a user to review.

PREPARED
General match data has been reviewed but late match-day data may still be missing.

READY
All required speaker information has been verified.

COMPLETED
Match has taken place.
```

`READY` must represent human-reviewed data, not merely successful synchronization.

---

# 15. Verification

Provide section-level verification.

Suggested sections:

```text
Match details
Home-team squad
Away-team squad
Captains and coaches
Home starting lineup
Away starting lineup
Officials
```

Example:

```text
✓ Match details
✓ NTNUI squad
✓ Away squad
✓ Captains/coaches
⚠ NTNUI starting lineup missing
✓ Away starting lineup
⚠ Referee 2 missing
```

The user should be able to see immediately what is missing.

---

# 16. Match Snapshot Philosophy

Imported source data may continue to change.

Verified or manually corrected information must not be silently replaced.

For v1:

- source values may refresh;
- manual overrides remain;
- verification state remains;
- conflicting provider changes should be surfaced to the admin.

Later, a formal frozen snapshot may be added if useful.

Store:

```text
prepared_at
prepared_by
verified_at
verified_by
```

where appropriate.

---

# 17. Core Match Data

Store:

```text
external_match_id
season
competition
scheduled_at
venue
home_team
away_team
match_status
external_source
external_updated_at
last_sync_attempt_at
last_sync_status
verification_status
prepared_at
prepared_by
verified_at
verified_by
created_at
updated_at
```

Optional:

```text
external_match_url
match_notes
speaker_notes
```

All displayed match times must use the `Europe/Oslo` timezone.

Do not depend on the server's local timezone.

---

# 18. Teams

Store at least:

```text
id
external_id
name
short_name
gender
competition
is_ntnui
created_at
updated_at
```

Avoid unnecessary duplication of permanent team metadata in match-specific records.

---

# 19. Match Squad

The application must distinguish between:

```text
GENERAL TEAM ROSTER
```

and:

```text
MATCH SQUAD
```

Use the match-specific squad whenever available.

The full match squad should be stored even though the speaker does not announce every player.

For each player in the match squad, support:

```text
id
match_id
team_id
external_player_id
source_name
speaker_name_override
shirt_number_source
shirt_number_override
is_on_match_roster
pronunciation_note
created_at
updated_at
```

Optional future fields may be added only when required.

Do not initially import unnecessary personal information such as:

- birth date;
- player height;
- detailed statistics;
- attack reach;
- unrelated profile data.

---

# 20. Full Squad vs Announced Lineup

The complete match squad is preparation data.

The speaker announces only:

```text
6 starting players
+
1 libero
```

The application must never assume that the whole match squad should be announced.

The full squad must remain accessible so that the admin can manually choose the starting lineup if automatic starting-lineup data is unavailable.

---

# 21. Starting Lineup

Starting lineup is a first-class match entity.

Use a design similar to:

## `match_lineups`

```text
id
match_id
team_id
source
status
verified_at
verified_by
created_at
updated_at
```

Suggested `status` values:

```text
not_available
partial
needs_review
verified
```

## `match_lineup_players`

```text
lineup_id
match_player_id
role
announcement_order
created_at
updated_at
```

Supported `role` values:

```text
starter
libero
```

Do not store permanent starting status on a player.

Starting status belongs to a specific match.

---

# 22. Starting-Lineup Rules

A standard announced lineup consists of:

- exactly 6 starters;
- exactly 1 libero.

The selected libero must be part of the stored match squad.

A player must not accidentally count as both one of the six starters and the announced libero.

The application should normally reject verification unless these rules are satisfied.

An admin may use an explicit override if an exceptional real-world case requires deviation.

Such an override must require confirmation.

---

# 23. Automatic Lineup Import

If the provider supplies starting-lineup data, import it.

Store:

- six starters where available;
- libero;
- source;
- provider update timestamp.

Imported lineups must initially be treated as `needs_review`.

Example:

```text
BK TROMSØ — STARTING LINEUP

✓ #3 Player A
✓ #4 Player B
✓ #8 Player C
✓ #10 Player D
✓ #13 Player E
✓ #19 Player F

LIBERO
✓ #16 Player G

Source: External provider
Updated: 14:43

[Confirm lineup]
[Edit]
```

---

# 24. Manual Lineup Selection

If starting-lineup information is missing or incomplete, an admin must be able to select it manually from the full match squad.

The UI should make progress obvious.

Example:

```text
NTNUI — STARTING LINEUP

Starting players: 4 / 6 selected

☐ #1 Player A
☑ #2 Player B
☑ #3 Player C
☐ #4 Player D
☑ #5 Player E
☑ #6 Player F
...

LIBERO

○ #1 Player A
○ #13 Player G
● #15 Player H

[Confirm lineup]
```

Once complete:

```text
Starting players: ✓ 6 / 6
Libero:             ✓ Selected
```

The full squad must remain visible while selecting.

---

# 25. Lineup Overrides and Conflicts

A manual lineup correction must survive later synchronization.

Example:

```text
External:
#2 #3 #5 #6 #9 #11

Verified:
#2 #3 #4 #6 #9 #11
```

If the provider later changes its lineup, do not silently overwrite the verified lineup.

Show a conflict such as:

```text
External lineup has changed since verification.

External:
#2 #3 #5 #6 #9 #11

Verified:
#2 #3 #4 #6 #9 #11

[Review changes]
```

---

# 26. Announcement Order

Starting status and announcement order are separate concepts.

Support:

```text
starter yes/no
announcement_order 1–6
```

The six starters should be manually reorderable.

Simple move-up / move-down controls are sufficient for v1.

Drag-and-drop is not required.

The libero should be announced separately.

---

# 27. Team Staff

For each team in a match, support:

```text
head_coach
assistant_coach
team_manager
other relevant staff
```

Initial script requirements only require the roles needed by the speaker.

Store source and optional manual override where relevant.

---

# 28. Captain

Captain must be stored separately from lineup role.

Support:

- imported captain;
- manual captain override;
- effective captain.

The captain should reference a `match_player` where possible.

If external captain data is unavailable, allow manual selection from the match squad.

---

# 29. Officials

Support at least:

```text
first_referee
second_referee
```

Schema may allow additional officials later.

Officials may appear late, so synchronization must be able to update them as match day approaches.

Store:

```text
id
match_id
external_person_id
name_source
name_override
role
source
created_at
updated_at
```

---

# 30. Player of the Match

Near the end of the match, the operator must be able to choose:

```text
team
player
```

Use the stored match squads for selection.

Store the result in a dedicated award model.

Suggested:

## `match_awards`

```text
id
match_id
award_type
team_id
match_player_id
created_at
created_by
updated_at
```

Initial `award_type`:

```text
player_of_match
```

The selection must remain editable.

---

# 31. Speaker Script

Generate the speaker script dynamically from:

```text
stored match data
+
effective overrides
+
verified starting lineups
+
central script definition
```

Do not hard-code script fragments across many React components.

For v1, keep script wording centrally in code.

A generic CMS/template editor is out of scope.

A suitable pattern may be:

```ts
type ScriptSection =
  | SpokenSection
  | InstructionSection
  | PlayerListSection
  | AwardSection;
```

and:

```ts
buildSpeakerScript(match)
```

---

# 32. Script Structure

The initial script should follow the workflow reflected in the supplied speaker document.

The sequence should support at least:

```text
1. Welcome
2. Opponent introduction
3. Captains
4. Coaches
5. Handshake instruction
6. Referees to center
7. Referee introduction
8. General good-match introduction
9. Away-team starting six + libero
10. NTNUI starting six + libero
11. Match played
12. Player of the match
13. Closing announcement
```

The exact Norwegian wording may be refined later without redesigning the data model.

---

# 33. Spoken Text vs Instructions

The existing speaker workflow includes both words that should be announced and stage directions that should not be read aloud.

Model these separately.

Example:

```ts
{
  type: "speech",
  text: "Dagens motstander er ..."
}
```

versus:

```ts
{
  type: "instruction",
  text: "Håndhilsing"
}
```

The UI must make the difference obvious.

Example:

```text
SAY
Dagens motstander er ...

INSTRUCTION
Håndhilsing

SAY
Dagens førstedommer er ...
```

Do not rely only on color to communicate the distinction.

---

# 34. Missing Script Data

If required information is missing, do not silently omit it and do not render technical placeholders.

Never show:

```text
undefined
null
{awayCaptain.name}
```

Instead show a clear blocking warning:

```text
MISSING: second referee
```

or:

```text
STARTING LINEUP NOT VERIFIED
```

The warning should be visible before the relevant script section.

---

# 35. Player Introduction

Speaker Mode must announce only the verified effective lineup.

Conceptually:

```ts
const playersToAnnounce = [
  ...effectiveStartingSix,
  effectiveLibero
];
```

The full squad must not be looped over for announcement.

The script may present:

```text
BK Tromsø starter med følgende spillere:

Nummer 3, Player A
Nummer 4, Player B
Nummer 8, Player C
Nummer 10, Player D
Nummer 13, Player E
Nummer 19, Player F

Libero:
Nummer 16, Player G
```

The exact spoken wording should be centralized and easy to modify.

---

# 36. Pronunciation Notes

Support an optional:

```text
pronunciation_note
```

for match players.

This note is for the speaker only.

It should not become part of the spoken script text automatically.

Speaker Mode may display it in smaller secondary text.

Do not add automated pronunciation generation in v1.

---

# 37. Speaker Notes

Support optional match-level and speaker-level notes.

Examples:

```text
Hold announcement until teams enter.
Captain changed today.
Do not announce assistant coach.
```

Notes must be visually distinct from spoken text.

---

# 38. Speaker Mode

Speaker Mode is the application's most important UI.

It should be optimized for readability, speed, and reliability.

Requirements:

- large default text;
- high contrast;
- responsive on laptop and tablet;
- minimal visual clutter;
- no large site navigation;
- no accidental editing controls;
- clear difference between spoken text and instructions;
- quick section navigation;
- stable layout while reading;
- keyboard support;
- touch-friendly controls;
- no tiny hover-only controls.

Suggested controls:

```text
← Previous section

3 / 8

Next section →

A−   A+
```

Keyboard:

```text
ArrowRight / Space → next section
ArrowLeft          → previous section
```

Do not hijack keyboard behavior when focus is inside an editable input.

---

# 39. Fullscreen Mode

Speaker Mode should support browser fullscreen/presentation mode where available.

Fullscreen should hide:

- site navigation;
- administrative metadata;
- unrelated controls.

Display only:

- match identity;
- script;
- section controls;
- essential status/warnings.

---

# 40. Speaker Progress

Allow sections to be marked completed.

Example:

```text
✓ Welcome
✓ Captains
→ Referees
○ Away lineup
○ NTNUI lineup
○ Player of the match
```

This may remain session-local in v1.

It does not require complex persistence.

---

# 41. Panic Editing

An admin should be able to quickly correct match data shortly before or during the match.

Speaker Mode or the preview page should expose a small admin-only:

```text
Edit match
```

action.

The user should be able to:

```text
edit
save
return to script
```

with minimal navigation.

The script should regenerate from the updated effective data.

---

# 42. Staleness Indicators

Always display the age of synchronized source data on preparation pages.

Examples:

```text
Data updated:
26 Sep 2026, 18:42

✓ Latest update successful
```

or:

```text
⚠ External update failed

Using locally stored information from:
25 Sep 2026, 21:15
```

Do not silently present stale information as if it was freshly retrieved.

---

# 43. Offline / Failure Resilience

Version 1 requirement:

- external provider failure must not break previously stored match data.

Future enhancement:

- PWA/service-worker caching may allow an already prepared Speaker Mode page to continue working during a complete local internet outage.

This second layer is optional for v1.

---

# 44. Admin Dashboard

Primary route:

```text
/matches
```

Show upcoming supported home matches.

Example:

```text
UPCOMING

SAT 03 OCT · 15:00

NTNUI
vs
BK Tromsø

Dragvollhallen
1. divisjon women

⚠ Needs review

[Prepare match]
```

Ready matches may instead show:

```text
✓ Ready

[Open Speaker Mode]
```

Also provide:

```text
[Sync matches]
```

for admins.

Past matches may appear in a separate history section.

---

# 45. Match Preparation Screen

Route:

```text
/matches/[id]
```

Suggested structure:

```text
MATCH DETAILS
TEAM STAFF
HOME SQUAD
AWAY SQUAD
HOME STARTING LINEUP
AWAY STARTING LINEUP
OFFICIALS
READINESS
```

Example:

```text
NTNUI – BK Tromsø
3 Oct 2026 · 15:00
Dragvollhallen

Last synced: 2 minutes ago

[Update from source]

──────────────────────

MATCH INFORMATION       ✓

REFEREES                ⚠
First referee           Name
Second referee          Missing

BK TROMSØ               ✓
Captain                 #7 Name
Head coach              Name
Full squad              16 players
Starting lineup         ✓ Verified

NTNUI                    ⚠
Captain                 #10 Name
Head coach              Name
Full squad              16 players
Starting lineup         Missing

──────────────────────

[Preview script]

[Mark ready]
```

---

# 46. Script Preview

Route:

```text
/matches/[id]/script
```

This should show exactly what Speaker Mode will render, but within the normal application shell.

Missing data must appear clearly.

Example:

```text
MISSING: second referee
```

The admin should be able to resolve missing data from here.

---

# 47. Speaker Route

Route:

```text
/matches/[id]/speaker
```

Requirements:

- large script;
- section navigation;
- minimal chrome;
- fullscreen support;
- player-of-match selection near the appropriate stage;
- view-full-squad option;
- admin panic-edit shortcut;
- warnings for missing/invalid data.

---

# 48. Full Squad Access

Even after lineup verification, the complete squad must remain available.

Speaker Mode should provide a small:

```text
View full squad
```

action.

This is useful if:

- automatic starting-lineup data was unavailable;
- a late lineup change occurs;
- the speaker needs to identify another player.

The full squad should not dominate the main script view.

---

# 49. Readiness Rules

Separate general preparation from final speaker readiness.

Example:

```text
PREPARED
General match information verified.
Starting lineups may still be pending.
```

and:

```text
READY
All required speaker information verified.
```

Initial required data for `READY`:

```text
✓ home team
✓ away team
✓ date
✓ start time
✓ venue

✓ home match squad
✓ away match squad

✓ home captain
✓ away captain

✓ home head coach
✓ away head coach

✓ home 6 starters
✓ home libero

✓ away 6 starters
✓ away libero

✓ first referee
✓ second referee
```

An admin may explicitly override readiness in exceptional circumstances.

This must require confirmation and the UI should retain a visible warning.

---

# 50. Suggested Database Model

## `profiles`

```text
id
display_name
role
created_at
updated_at
```

## `teams`

```text
id
external_id
name
short_name
gender
competition
is_ntnui
created_at
updated_at
```

## `matches`

```text
id
external_id
season
competition
home_team_id
away_team_id
scheduled_at
venue
status
external_source
external_updated_at
last_sync_attempt_at
last_sync_status
verification_status
prepared_at
prepared_by
verified_at
verified_by
match_notes
speaker_notes
created_at
updated_at
```

## `match_players`

```text
id
match_id
team_id
external_player_id
source_name
speaker_name_override
shirt_number_source
shirt_number_override
is_on_match_roster
pronunciation_note
created_at
updated_at
```

## `match_lineups`

```text
id
match_id
team_id
source
status
verified_at
verified_by
created_at
updated_at
```

## `match_lineup_players`

```text
lineup_id
match_player_id
role
announcement_order
created_at
updated_at
```

## `match_staff`

```text
id
match_id
team_id
external_person_id
name_source
name_override
role
source
created_at
updated_at
```

## `match_officials`

```text
id
match_id
external_person_id
name_source
name_override
role
source
created_at
updated_at
```

## `match_awards`

```text
id
match_id
award_type
team_id
match_player_id
created_at
created_by
updated_at
```

## `sync_logs`

```text
id
provider
match_id
started_at
completed_at
status
error_summary
```

---

# 51. Optional Raw Source Snapshots

If permitted and useful for debugging, external source responses may be stored separately.

Possible table:

```text
external_match_snapshots
```

Fields:

```text
id
match_id
provider
fetched_at
payload
```

Speaker Mode must never depend on parsing raw provider JSON.

Do not store unnecessary sensitive data.

---

# 52. RLS and Security

Continue using Supabase Row Level Security.

Minimum behavior:

## Authenticated users

Can:

- read relevant match information;
- read lineups;
- read speaker scripts derived from stored data.

## Admins

Can:

- insert/update/delete match preparation data;
- trigger synchronization;
- apply manual overrides;
- verify sections;
- select lineups;
- select player of the match.

Never expose Supabase service-role credentials to browser code.

Any provider credentials must remain server-side.

Do not weaken RLS to make frontend development easier.

---

# 53. Supported-Team Configuration

Do not scatter external IDs throughout source files.

Use centralized typed configuration.

Conceptually:

```ts
export const supportedTeams = [
  {
    key: "ntnui-women",
    teamExternalId: "...",
    competitionExternalId: "...",
    venueExternalId: "...",
  },
  {
    key: "ntnui-men",
    teamExternalId: "...",
    competitionExternalId: "...",
    venueExternalId: "...",
  },
];
```

This may initially live in application configuration rather than an admin UI.

A settings CMS is not required for v1.

---

# 54. Logging

Synchronization failures should be logged.

Logs should help answer:

```text
When did synchronization last work?
Which provider was used?
Which match failed?
Was data unavailable, malformed, or unreachable?
```

Do not log:

- passwords;
- access tokens;
- service-role keys;
- unnecessary personal data.

---

# 55. Norwegian Text Handling

The application must correctly support:

```text
æ
ø
å
Æ
Ø
Å
```

across:

- database storage;
- provider import;
- rendering;
- sorting;
- script generation.

Use UTF-8 consistently.

---

# 56. Accessibility

Speaker Mode and admin pages should include:

- sufficient contrast;
- keyboard navigation;
- visible focus states;
- touch-friendly controls;
- readable font sizes;
- no information communicated only by color.

Avoid tiny controls and hover-only interactions.

---

# 57. Testing Requirements

## 57.1 Match Filtering

Test at least:

```text
NTNUI Women home + Dragvollhallen → included
NTNUI Women away → excluded
NTNUI Men home + Dragvollhallen → included
Other NTNUI team → excluded
Different venue → excluded
Wrong competition → excluded
```

## 57.2 Synchronization

Test:

```text
new match is inserted
existing match is updated rather than duplicated
provider outage preserves stored data
manual override survives synchronization
provider change creates reviewable conflict
```

## 57.3 Match Squad

Test:

```text
match squad imports correctly
full squad remains stored even when only 7 players are announced
speaker script does not announce the whole squad
```

## 57.4 Starting Lineup

Test:

```text
exactly 6 starters accepted
fewer than 6 rejected
more than 6 rejected
libero required
same player cannot accidentally be starter and libero
manual lineup selection works
imported lineup requires review
manual verified lineup survives later sync
announcement order is respected
```

## 57.5 Script Generation

Given known match data, test:

```text
team names inserted correctly
captains inserted correctly
coaches inserted correctly
referees inserted correctly
only starting 6 + libero are announced
player names and shirt numbers are correct
instructions are separate from spoken text
player-of-match announcement renders correctly
```

## 57.6 Missing Data

Test that missing required data produces clear warnings and never renders:

```text
undefined
null
unresolved template placeholders
```

## 57.7 Authorization

Test:

```text
normal user cannot edit protected match data
normal user cannot trigger privileged sync
admin can edit
admin can verify
admin can select lineup
```

---

# 58. End-to-End Demo Fixture

Create at least one fully fictional match.

Example:

```text
NTNUI
vs
Example Volleyball Club

Dragvollhallen
```

Include:

- two full squads;
- six starters per team;
- one libero per team;
- captains;
- coaches;
- two referees;
- speaker notes;
- optional pronunciation note;
- player-of-match selection.

E2E test:

```text
login
→ view upcoming matches
→ select fixture
→ review data
→ select missing lineup manually
→ verify lineup
→ mark match ready
→ preview script
→ open Speaker Mode
→ navigate sections
→ choose player of the match
→ display final announcement
```

CI must use the mock provider.

---

# 59. Explicit Provider-Failure Test

Required test:

```text
1. Import a match successfully.
2. Persist match data.
3. Simulate provider outage.
4. Attempt another synchronization.
5. Open match page.
6. Open Speaker Mode.
7. Existing stored data remains available.
8. Warning indicates failed refresh.
```

This scenario must pass before release.

---

# 60. Version 1 Routes

Keep v1 small.

Required routes:

```text
/login
/matches
/matches/[id]
/matches/[id]/script
/matches/[id]/speaker
```

Do not create broad settings/admin sections unless required.

---

# 61. Out of Scope for Version 1

Do not build:

- live scoring;
- match statistics;
- public team pages;
- general club website;
- ticket sales;
- team chat;
- training planning;
- player profiles;
- social feeds;
- push notification platform;
- livestream integration;
- league standings;
- fantasy features;
- general club administration;
- advanced CMS;
- generic script-template editor;
- AI pronunciation system;
- complex drag-and-drop UI;
- analytics dashboards.

Keep the application focused.

---

# 62. Implementation Phases

## Phase 1 — Repository Cleanup and Product Shell

- duplicate repository into independent repo;
- preserve Next.js/Supabase/auth infrastructure;
- remove unrelated product functionality;
- simplify navigation;
- retain test tooling;
- retain working reusable UI components;
- update project branding.

Do not change the original repository.

---

## Phase 2 — Match Domain and Database

Implement migrations for:

```text
profiles
teams
matches
match_players
match_lineups
match_lineup_players
match_staff
match_officials
match_awards
sync_logs
```

Implement RLS.

Implement source/override/effective-value semantics.

---

## Phase 3 — Mock Provider

Implement:

```text
MatchProvider
MockMatchProvider
```

Include complete and incomplete fixtures.

Support simulated provider errors.

---

## Phase 4 — Match Discovery and Synchronization

Implement:

- supported-team filtering;
- home-match filtering;
- venue filtering;
- match upsert;
- roster import;
- staff import;
- official import;
- lineup import;
- sync metadata;
- sync logging;
- preservation of manual overrides.

---

## Phase 5 — Preparation UI

Implement:

```text
/matches
/matches/[id]
```

Support:

- status;
- readiness;
- missing-data warnings;
- manual corrections;
- full squad review;
- manual lineup selection;
- lineup ordering;
- verification;
- manual sync.

---

## Phase 6 — Script Generation

Implement central typed script generation.

Use the existing speaker-document flow as the initial script structure.

Support:

- spoken sections;
- instruction sections;
- captains;
- coaches;
- referees;
- starting six;
- libero;
- player of the match.

---

## Phase 7 — Speaker Mode

Implement:

```text
/matches/[id]/script
/matches/[id]/speaker
```

Support:

- large text;
- fullscreen;
- keyboard navigation;
- section progress;
- font sizing;
- notes;
- clear instructions;
- squad lookup;
- panic editing.

---

## Phase 8 — Production Provider

Investigate and implement the approved real data source or sources.

Do not modify application domain logic to match provider-specific schemas.

Map providers into the existing normalized model.

---

## Phase 9 — Reliability Hardening

Test:

- provider unavailable;
- malformed provider response;
- stale data;
- lineup changed externally;
- manual override;
- duplicate sync;
- missing officials;
- missing lineup;
- Speaker Mode open during refresh;
- Supabase transient failure.

Optional:

- PWA/service-worker caching.

---

# 63. Codex Working Rules

Before making substantial changes, Codex must read:

```text
README.md
AGENTS.md
this specification
package.json
relevant source files
supabase migrations
tests
```

Prefer reusing proven infrastructure over rewriting it.

Do not implement later phases while working on an earlier phase unless required by a dependency.

Do not modify unrelated code.

Do not weaken security.

All database changes must be implemented through migrations.

Do not expose service credentials.

After each substantial phase, run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Run relevant E2E tests for UI changes.

Fix failures caused by the implementation before considering a phase complete.

---

# 64. Required Codex Completion Summary

After each implementation phase, report:

```text
Files changed
Database migrations added
Behavior added or removed
Tests added or changed
Commands run
Remaining known issues
Items intentionally deferred
```

---

# 65. Acceptance Criteria for Version 1

Version 1 is complete when all of the following are true:

1. A user can log in with Supabase.
2. The application shows only relevant supported NTNUI home matches.
3. Match data can be imported through the provider abstraction.
4. Imported data is stored in Supabase.
5. Previously stored match data survives provider failure.
6. Admins can correct imported values manually.
7. Manual overrides survive later synchronization.
8. Full match squads are stored and viewable.
9. The admin can manually choose starting players from the full squad.
10. The application validates six starters plus one libero.
11. Imported starting lineups can be reviewed and confirmed.
12. Verified lineups are not silently overwritten by later sync.
13. Captains can be verified or corrected.
14. Coaches can be verified or corrected.
15. Referees can be verified or entered manually.
16. Match readiness clearly communicates missing information.
17. The script generator announces only the six starters plus libero.
18. Spoken text and stage instructions are visually distinct.
19. Missing required data produces clear warnings.
20. Speaker Mode is usable with keyboard and touch controls.
21. Speaker Mode supports large readable text.
22. Speaker Mode can display the player-of-the-match announcement.
23. The complete squad remains accessible during match-day use.
24. RLS prevents unauthorized edits.
25. CI uses deterministic mock-provider data.
26. The explicit provider-outage test passes.
27. Lint, typecheck, unit tests, build, and relevant E2E tests pass.

---

# 66. Guiding Engineering Principles

1. Keep the product focused on the speaker workflow.
2. Prefer stored, reviewed match data over live external dependency.
3. Treat external data as input, not unquestioned truth.
4. Make manual correction fast.
5. Never silently overwrite verified information.
6. Distinguish full match squad from announced lineup.
7. Announce only six starters plus one libero.
8. Make missing information obvious.
9. Optimize Speaker Mode for readability and reliability.
10. Keep provider-specific logic isolated.
11. Keep version 1 small.
12. Reuse proven infrastructure from the original repository.
13. Remove obsolete functionality cleanly.
14. Preserve strong Supabase/RLS security.
15. Make failure states testable and predictable.

---

# 67. Initial Script Reference

The uploaded speaker document should be treated as the initial reference for:

- welcome wording;
- opponent introduction;
- captain introduction;
- coach introduction;
- handshake instruction;
- referee staging;
- first- and second-referee introduction;
- player-introduction flow;
- NTNUI player-introduction flow;
- player-of-the-match announcement.

However, the application must adapt that workflow to all supported NTNUI home matches rather than hard-coding one opponent or roster.

The full squad should remain available for preparation, while only the verified six starters plus libero are announced.

---

# 68. Final Product Goal

The application should make this scenario easy:

```text
Speaker arrives at Dragvollhallen.

Opens the site.

Sees today's NTNUI match.

Most information is already imported.

Checks:
✓ teams
✓ squads
✓ captains
✓ coaches
✓ referees

Starting lineup has not arrived automatically.

Clicks "Select lineup".

Chooses 6 starters + libero from the full squad.

Confirms.

Opens Speaker Mode.

Reads the script.

External provider goes down.

Nothing important breaks.

Later chooses player of the match.

Reads final announcement.

Done.
```

If the implementation succeeds at this workflow reliably, the product is doing its job.
