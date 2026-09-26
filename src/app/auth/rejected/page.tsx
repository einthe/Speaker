import { redirect } from "next/navigation";
import { getAccount } from "@/server/queries";
import { SignOutButton } from "@/components/sign-out-button";
export default async function Rejected() {
  const profile = await getAccount();
  if (!profile) redirect("/auth/sign-in");
  if (profile.account_status === "approved") redirect("/feed");
  if (profile.account_status === "pending") redirect("/auth/pending");
  return (
    <>
      <h2>
        {profile.account_status === "disabled"
          ? "Kontoen er deaktivert."
          : "Forespørselen er ikke godkjent."}
      </h2>
      <p className="auth-intro">Kontakt lagets administrator hvis du mener dette er feil.</p>
      <SignOutButton className="button secondary" />
    </>
  );
}
