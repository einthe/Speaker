"use client";
import { useState } from "react";
import { registrationRoleKeys, secondaryRoles } from "@/lib/domain";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms";
export default function SignUp() {
  const [role, setRole] = useState("player");
  return (
    <>
      <h2>Opprett konto</h2>
      <p className="auth-intro">
        Opprett en konto. Administrator gir deg tilgang til lagrommet når medlemskapet er godkjent.
      </p>
      <ActionForm auth>
        <input type="hidden" name="mode" value="sign-up" />
        <label>
          Fullt navn
          <input
            name="full_name"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
            placeholder="Fornavn Etternavn"
          />
        </label>
        <label>
          E-postadresse
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="deg@eksempel.no"
          />
        </label>
        <label>
          Passord
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder="Minst 12 tegn"
          />
        </label>
        <label>
          Rolle
          <select name="base_role" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="player">Spiller</option>
            <option value="coach">Trener</option>
          </select>
        </label>
        {role === "player" && (
          <>
            <label>
              Draktnummer
              <input
                name="jersey_number"
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                step={1}
                required
              />
            </label>
            <fieldset>
              <legend>Verv (valgfritt)</legend>
              <div className="checkbox-grid">
                {registrationRoleKeys.map((key) => (
                  <label key={key} className="checkbox-label">
                    <input type="checkbox" name="roles" value={key} />
                    {secondaryRoles[key]}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <Submit>Opprett konto</Submit>
      </ActionForm>
      <div className="auth-switch">
        Allerede med? <Link href="/auth/sign-in">Logg inn</Link>
      </div>
    </>
  );
}
