"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="standalone-message">
      <h1>Vi fikk ikke kontakt med lagrommet</h1>
      <p className="muted">
        Prøv igjen om et øyeblikk. Kontakt administrator hvis problemet fortsetter.
      </p>
      <button className="button" onClick={retry}>
        Prøv igjen
      </button>
    </main>
  );
}
