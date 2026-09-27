// These IDs identify in-memory matches and players. getRandomValues also works
// on HTTP origins, where the browser does not expose crypto.randomUUID.
export function createLocalId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
