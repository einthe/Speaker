import type { TeamEvent } from "./domain";
import { dateLabel } from "./dates";

export function eventDateLabel(event: TeamEvent) {
  if (!event.starts_at) return "Dato ikke fastsatt";
  if (event.external_time_unknown)
    return `${dateLabel(event.starts_at, "d. MMM yyyy")} · Tidspunkt ikke fastsatt`;
  return dateLabel(event.starts_at);
}
export const importedMatchStatus = {
  scheduled: "",
  postponed: "Utsatt",
  cancelled: "Avlyst",
  unavailable: "Ikke lenger i kampoppsettet",
};
