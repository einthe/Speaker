# Registration choices

Registration asks for name, email, password and **Rolle** (Spiller/Trener).
Players also enter a jersey number from 0 to 99 and can select zero or several
**Verv**: SoMe, Oppmann, Reiseansvarlig, Sosialansvarlig, Økonomiansvarlig,
Dugnadsansvarlig and Botsjef. Kaptein and Visekaptein are assigned by admins only.
Coaches do not submit a jersey number or Verv.

Selections are saved as a registration request, not active permissions. New
accounts remain pending with no active base role or responsibilities. The admin
approval form prefills the requested role, jersey and Verv, which the admin can
change before approving. Jersey numbers are reserved only at approval; if one
is already taken, the admin can change it and submit again.

The signup trigger validates requests even when the app form is bypassed.
Requests are readable only by their owner and an approved admin, and cannot be
changed directly. Later edits to Auth user metadata cannot change these requests
or account permissions. Legacy registrations without choices still work and
retain the original approval flow.

Apply `supabase/migrations/202609220003_registration_choices.sql` before deploying
the app (`npx supabase db push` applies pending migrations in order). The migration
does not change existing accounts or permissions. Restart `npm run dev` to use
the updated registration flow in the local demo.

Checks: `npm test -- tests/domain.test.ts tests/registration-database.test.ts`,
and `npm run test:e2e:local -- tests/e2e/registration.spec.ts` for desktop/mobile
registration, admin approval, privacy, accessibility and pending-page sign-out.
