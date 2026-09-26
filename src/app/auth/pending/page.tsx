import Link from "next/link";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { getAccount } from "@/server/queries";
import { SignOutButton } from "@/components/sign-out-button";
export default async function Pending() {
  const profile = await getAccount();
  if (profile?.account_status === "approved") redirect("/feed");
  if (profile && profile.account_status !== "pending") redirect("/auth/rejected");
  return (
    <>
      <span className="empty-icon">
        <Hourglass size={28} />
      </span>
      <h2>Venter på godkjenning</h2>
      <p className="auth-intro">
        Administrator må godkjenne kontoen før du får tilgang. Hvis du har fått en bekreftelseslenke
        på e-post, åpne den først.
      </p>
      <div className="button-row">
        <Link className="button" href="/feed">
          Sjekk tilgang
        </Link>
        <SignOutButton className="button secondary" />
      </div>
    </>
  );
}
