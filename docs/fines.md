# Bøter

The sidebar entry below Dugnadspoeng opens `/fines`:

- **Bøtetabell** lists approved players and coaches, including zero totals, ordered
  by total descending, name, then ID. Admins are excluded. The current user's row
  is highlighted. Each name expands/collapses its full fine history.
- **Bøter** lists fine types, descriptions and prices for all approved users. Only
  Botsjef and admins can create/edit types and deactivate types that should no
  longer be offered. The **Ny bot** button opens a form that closes after saving
  or cancellation. Inactive types are marked. There is no Botregler tab.
- **Ekstraregler**, below the types in Bøter, lists named multipliers for everyone.
  Botsjef/admin can create/edit/deactivate them. Factors range from 0.01 to 100 with up to two decimal places;
  both comma and decimal-point input are accepted. The demo includes **Kampdag – 2×**.

Admins assign **Botsjef** (`fine_manager`) under a player's responsibility roles
in Brukere og tilganger, like the existing captain and coordinator roles. Coaches
can receive fines but do not acquire management rights from being a coach.
Botsjef also works as a role-post author context, with its own label and color.

Managers use the plus button beside a person to select an active fine type and
optionally enter a note and choose one extra rule. **Vanlig – 1×** is always the
initial selection in the assignment form only; it is not listed under Ekstraregler. The form previews the multiplied amount before submission.
The server reads the factor itself; it ignores client-supplied prices/factors.
Amounts round to the nearest øre (half øre rounds up), identically in the preview
and database. The base amount, multiplier name/factor and final amount are saved together, so
later changes to an extra rule never change historical fines. Inactive rules
cannot be applied. The final amount cannot exceed 1,000,000 kr.

Amounts are derived from the type on the server and
stored as integer øre. Whole amounts display without decimals (for example,
`50 kr`). Any existing fractional amounts retain their precision. Each fine
records its original type name, price, note, issuer name and timestamp. Later
type edits do not alter historical fines. A submission ID prevents duplicate
charges when a request is retried. Stale price/type edits are rejected.

Mistakes can be annulled with confirmation. An annulled fine remains in history
but no longer contributes to the total. Totals represent recorded, non-annulled
fines; this feature does not track payments. Disabling an account hides it from
the table while preserving its records for later reactivation.

## Deployment

Apply these migrations in order before deploying (do not reset production):

1. `supabase/migrations/202609210002_fine_manager.sql`
2. `supabase/migrations/202609210003_fines.sql`
3. `supabase/migrations/202609220001_fine_multipliers.sql`
4. `supabase/migrations/202609220002_decimal_fine_multipliers.sql`

Apply only migrations not already deployed. The decimal-multiplier migration
preserves existing factors and fine amounts. Existing fines retain their amounts and are recorded as Vanlig – 1×.

The enum addition is separate so PostgreSQL commits it before it is used. These
migrations add no real fines or rules. Existing pending migrations, including the
image-setting migration, should also be applied through the normal migration flow.

The demo applies them on restart. Log in as `theo@demo.test` with
`DemoVolleyball123!` to try Botsjef. The demo includes fictional types and
fines for both players and a coach; `admin@demo.test` can also manage them.

## Authorization and checks

All reads require an approved account. Database RLS and validated RPCs enforce
management permissions independently of the UI; clients cannot directly write
fine records, snapshots, rules or prices. The authenticated `/api/team/fines`
endpoint uses the existing private, scoped read cache and `private, no-store`
HTTP responses. Successful edits invalidate the fines query immediately.

Run `npm test -- tests/fines.test.ts tests/fines-database.test.ts` and
`npm run test:e2e:local -- tests/e2e/fines.spec.ts`. Coverage includes permissions,
role assignment, exact amounts, sorting/zero totals, coaches, admin exclusion,
rules, replay protection, historical prices, annulment, access revocation,
role-post snapshots, mobile layout and accessibility.

`npm run test:e2e:demo -- tests/demo/fines.spec.ts` also verifies the seeded demo
accounts, examples and layout at narrow mobile widths.
