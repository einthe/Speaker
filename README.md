# NTNUI Speaker

A minimal dark speaker desk: matches on the left, a continuous scrollable script in the center, and editable team lists on the right. Use the header buttons to collapse or reopen either side panel. On smaller screens, the calendar and team buttons open the panels above the script.

Select up to six starters, a captain and a libero for each team. Edit player names, numbers, coaches, referees and the player of the match directly; the script updates immediately. Editable values are highlighted in cyan throughout the script. NTNUI is always announced last. Script wording follows the supplied Speaker BK Trømsø PDF.

All match data lives in React state in the current tab. Switching matches keeps edits; reloading, logging out or closing the tab discards them. No match reads or writes, verification, synchronization, cron, browser storage or shared persistence. All approved users can edit their own tab.

## Run locally

Use Node 24 LTS, then:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000.

- User: `user@demo.test`
- Admin: `admin@demo.test`
- Password for both: `DemoVolleyball123!`

Both accounts can use the same editor. The demo has three explicitly labelled fictional matches. Its isolated local Auth adapter does not contact a hosted Supabase project.

## Supabase login

Copy `.env.example` to `.env.local` and set the Supabase URL and publishable key. Run `npm run dev:connected`, or build with `npm run build` and start with `npm start`.

Supabase is used only for authentication and account access (`profiles.id` and `profiles.account_status = 'approved'`). Provision users through Supabase. There is no public signup.

The connected app starts empty; use **+** beside Kamper to add matches manually. `SPEAKER_DEMO=1` optionally enables fictional fixtures. No real match feed is configured.

The existing migration history is retained for the copied application's account schema. No new match schema is needed and no hosted migrations were applied during this change.

## Checks

```sh
npm run check
npm run test:e2e:local
npm run format:check
```

Unit tests cover announcement order, partial scripts, lineup selection and Oslo dates. Browser tests cover authentication, live script editing, match switching, reload reset, manual matches, desktop/mobile layouts and accessibility.
