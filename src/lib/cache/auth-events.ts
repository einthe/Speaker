// Only authentication boundaries restart the document. This also discards Next's
// private Router Cache; ordinary page navigation always stays client-side.
export function leaveAuthContext(destination: string, broadcast = true) {
  window.dispatchEvent(new Event("team:clear-private-cache"));
  if (broadcast && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("team-auth");
    channel.postMessage("changed");
    channel.close();
  }
  window.location.replace(destination);
}
