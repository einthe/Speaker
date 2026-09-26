"use client";
import Link from "next/link";
import type { ComponentProps } from "react";

// These views already fetch their data on the client. Changing only their query
// string should not wait for another server-rendered route response.
export function updateView(href: string) {
  const next = new URL(href, window.location.href);
  if (next.origin !== window.location.origin || next.pathname !== window.location.pathname)
    return false;
  if (next.href !== window.location.href)
    window.history.pushState(null, "", next.pathname + next.search + next.hash);
  return true;
}

export function ViewLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href" | "onNavigate" | "prefetch"> & { href: string }) {
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onNavigate={(event) => {
        if (updateView(href)) event.preventDefault();
      }}
    />
  );
}
