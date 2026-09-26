"use client";
import Link from "next/link";
import { catchError, type ErrorInfo } from "next/error";

function ContentFallback({ title, href }: { title: string; href?: string }, { retry }: ErrorInfo) {
  return (
    <section className="card empty-state" role="alert">
      <h2>{title}</h2>
      <p className="muted">Resten av lagrommet er fortsatt tilgjengelig.</p>
      <div className="button-row">
        <button className="button secondary" onClick={retry}>
          Prøv igjen
        </button>
        {href && (
          <Link className="button secondary" href={href}>
            Åpne siden
          </Link>
        )}
      </div>
    </section>
  );
}
export const ContentBoundary = catchError(ContentFallback);
