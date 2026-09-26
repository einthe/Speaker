"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { AccessChanged, queries } from "@/lib/cache/queries";
import type { Access } from "@/lib/cache/contract";
import { leaveAuthContext } from "@/lib/cache/auth-events";
import { SessionImageProvider } from "./session-image-provider";

export const TeamContext = createContext<Access | null>(null);
export function useTeam() {
  const access = useContext(TeamContext);
  if (!access) throw new Error("Missing authenticated query provider");
  return access;
}
export function TeamProvider({ initial, children }: { initial: Access; children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError(error) {
            if (error instanceof AccessChanged) leaveAuthContext(error.destination, false);
          },
        }),
        defaultOptions: {
          queries: {
            gcTime: 15 * 60_000,
            retry: false,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
        },
      }),
  );
  useEffect(() => {
    const clear = () => {
      setBlocked(true);
      void client.cancelQueries();
      client.clear();
    };
    window.addEventListener("team:clear-private-cache", clear);
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("team-auth") : null;
    if (channel) channel.onmessage = () => leaveAuthContext("/auth/sign-in", false);
    // BFCache can restore a private document after sign-out in another tab.
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) leaveAuthContext("/feed", false);
    };
    window.addEventListener("pageshow", restored);
    const leaving = () => {
      document.documentElement.style.visibility = "hidden";
    };
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("team:clear-private-cache", clear);
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("pagehide", leaving);
      channel?.close();
      void client.cancelQueries();
      client.clear();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      {blocked ? (
        <p role="status">Oppdaterer tilgang …</p>
      ) : (
        <SessionImageProvider key={initial.scope}>
          <Session initial={initial}>{children}</Session>
        </SessionImageProvider>
      )}
    </QueryClientProvider>
  );
}
function Session({ initial, children }: { initial: Access; children: ReactNode }) {
  const session = useQuery({
    ...queries.session(initial.scope),
    initialData: initial,
    refetchInterval: 30_000,
  });
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const client = useQueryClient();
  // The layout persists. Re-check stale authorization on navigation even when
  // that destination's content is still fresh in the client cache.
  useEffect(() => {
    void client.fetchQuery(queries.session(initial.scope)).catch(() => {});
  }, [client, pathname, search, initial.scope]);
  return <TeamContext.Provider value={session.data}>{children}</TeamContext.Provider>;
}
