"use client";
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
export function QueryState<T>({
  query,
  title,
  children,
}: {
  query: UseQueryResult<T, Error>;
  title: string;
  children: (data: T) => ReactNode;
}) {
  if (query.data === undefined)
    return query.isError ? (
      <section className="card empty-state" role="alert">
        <h2>{title}</h2>
        <button type="button" className="button secondary" onClick={() => void query.refetch()}>
          Prøv igjen
        </button>
      </section>
    ) : (
      <p className="muted" role="status">
        Laster inn …
      </p>
    );
  return (
    <>
      {query.isError && (
        <p className="message error" role="alert">
          Kunne ikke oppdatere. Viser sist hentede innhold.{" "}
          <button type="button" className="text-button" onClick={() => void query.refetch()}>
            Prøv igjen
          </button>
        </p>
      )}
      {children(query.data)}
    </>
  );
}
export function MissingRecord() {
  return (
    <div className="empty-state">
      <h1>Innholdet finnes ikke</h1>
      <p className="muted">Det kan ha blitt fjernet.</p>
      <Link className="button secondary" href="/feed">
        Tilbake til innlegg
      </Link>
    </div>
  );
}
