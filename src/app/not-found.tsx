import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone-message">
      <p className="eyebrow">404</p>
      <h1>Denne siden finnes ikke</h1>
      <p className="muted">Innholdet kan ha blitt fjernet, eller lenken kan være feil.</p>
      <Link className="button" href="/feed">
        Tilbake til lagrommet
      </Link>
    </main>
  );
}
