import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { nb } from "date-fns/locale";
export const timezone = "Europe/Oslo";
export function dateLabel(value: string, pattern = "d. MMM yyyy 'kl.' HH:mm") {
  return formatInTimeZone(value, timezone, pattern, { locale: nb });
}
export function localInput(value: string) {
  return formatInTimeZone(value, timezone, "yyyy-MM-dd'T'HH:mm");
}
export function toUTC(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Ugyldig dato.");
  const result = fromZonedTime(value, timezone);
  if (localInput(result.toISOString()) !== value)
    throw new Error("Tidspunktet finnes ikke på grunn av overgangen til sommertid.");
  return result.toISOString();
}
