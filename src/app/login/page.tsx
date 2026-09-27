import { Brand } from "@/components/ui";
import { signIn } from "@/server/auth-actions";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "config"
      ? "Supabase er ikke konfigurert."
      : error === "access"
        ? "Kontoen din har ikke tilgang."
        : error
          ? "Kontroller e-post og passord."
          : null;
  return (
    <main className="login">
      <Brand />
      <h1>Logg inn</h1>
      <form className="stack" action={signIn}>
        {message && (
          <p role="alert" className="warning">
            {message}
          </p>
        )}
        <label>
          E-post
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Passord
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <button>Logg inn</button>
      </form>
    </main>
  );
}
