import Link from "next/link";
import { ActionForm, Submit } from "@/components/forms";
export default function Recover() {
  return (
    <>
      <h2>Glemt passord?</h2>
      <p className="auth-intro">Vi sender deg en lenke for å velge et nytt passord.</p>
      <ActionForm auth>
        <input type="hidden" name="mode" value="recover" />
        <label>
          E-postadresse
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
        <Submit>Send lenke</Submit>
      </ActionForm>
      <div className="auth-switch">
        <Link href="/auth/sign-in">Tilbake til innlogging</Link>
      </div>
    </>
  );
}
