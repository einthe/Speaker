import { redirect } from "next/navigation";
import { getAccount } from "@/server/queries";
import { ActionForm, Submit } from "@/components/forms";
export default async function UpdatePassword() {
  if (!(await getAccount())) redirect("/auth/recover");
  return (
    <>
      <h2>Velg nytt passord</h2>
      <p className="auth-intro">Bruk et unikt passord med minst 12 tegn.</p>
      <ActionForm auth>
        <input type="hidden" name="mode" value="update-password" />
        <label>
          Nytt passord
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <Submit>Lagre passord</Submit>
      </ActionForm>
    </>
  );
}
