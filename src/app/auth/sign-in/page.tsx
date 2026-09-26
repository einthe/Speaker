import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ActionForm, Submit } from "@/components/forms";
import { getAccount } from "@/server/queries";
import { isConfigured } from "@/lib/supabase/server";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const account = await getAccount();
  if (account)
    redirect(
      account.account_status === "approved"
        ? "/feed"
        : account.account_status === "pending"
          ? "/auth/pending"
          : "/auth/rejected",
    );
  const { error } = await searchParams;
  return (
    <>
      <h2>Logg inn</h2>
      {!isConfigured() && (
        <p className="message info">
          Lagrommet klargjøres. Innlogging åpner når administrator har koblet til tjenesten.
        </p>
      )}
      {error && (
        <p role="alert" className="message error">
          Innloggingslenken er ugyldig eller utløpt. Prøv å logge inn igjen.
        </p>
      )}
      <ActionForm auth>
        <input type="hidden" name="mode" value="sign-in" />
        <label>
          E-postadresse
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="deg@eksempel.no"
            required
            maxLength={254}
          />
        </label>
        <div className="form-field">
          <span className="label-row">
            <label htmlFor="sign-in-password">Passord</label>
            <Link href="/auth/recover">Glemt passord?</Link>
          </span>
          <input
            id="sign-in-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Ditt passord"
            required
            maxLength={128}
          />
        </div>
        <Submit>
          Logg inn <ArrowRight size={18} />
        </Submit>
      </ActionForm>
      <div className="auth-switch">
        Ny på laget?{" "}
        <Link href="/auth/sign-up">
          Opprett konto <ArrowRight size={14} />
        </Link>
      </div>
    </>
  );
}
