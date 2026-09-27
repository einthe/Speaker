"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="container">
      <h1>Kunne ikke laste siden</h1>
      <button onClick={retry}>Prøv igjen</button>
    </main>
  );
}
