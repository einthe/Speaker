"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <div className="empty-state">
      <h1>Noe gikk galt</h1>
      <p className="muted">Vi kunne ikke hente innholdet. Prøv igjen om et øyeblikk.</p>
      <div className="button-row">
        <button className="button" onClick={retry}>
          Prøv igjen
        </button>
        <Link className="button secondary" href="/posts/new">
          Nytt innlegg
        </Link>
        <Link className="button secondary" href="/schedule">
          Til terminlisten
        </Link>
      </div>
    </div>
  );
}
