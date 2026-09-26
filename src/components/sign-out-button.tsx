"use client";
import { useState } from "react";
import { signOut } from "@/server/auth-actions";
import { leaveAuthContext } from "@/lib/cache/auth-events";
export function SignOutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      action={async () => {
        setPending(true);
        try {
          const result = await signOut();
          if (result.destination) leaveAuthContext(result.destination);
          else setError(result.error ?? "Kunne ikke logge ut.");
        } catch {
          setError("Kunne ikke logge ut. Prøv igjen.");
        } finally {
          setPending(false);
        }
      }}
    >
      <button type="submit" className={className} disabled={pending}>
        Logg ut
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
