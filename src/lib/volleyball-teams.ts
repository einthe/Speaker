const names: Record<number, string> = {
  913845: "NTNUI D2A",
  914600: "NTNUI D2B",
  914601: "NTNUI D2C",
};

export function volleyballTeamName(name: string, id?: number | null) {
  if (id && names[id]) return names[id];
  const match = /^NTNUI(?:\s*-\s*K)?\s+([234])$/i.exec(name.trim());
  if (match) return `NTNUI D2${{ "2": "A", "3": "B", "4": "C" }[match[1]]}`;
  return name
    .trim()
    .replace(/\s*-\s*[KM]\s*(\d+)$/i, (_, squad: string) =>
      Number(squad) === 1 ? "" : ` ${Number(squad)}`,
    );
}
