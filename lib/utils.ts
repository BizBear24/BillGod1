export { cn } from "cn"

/**
 * YYYY-MM-DD in the *local* calendar, not UTC.
 *
 * `toISOString().slice(0, 10)` is the usual shortcut and it is wrong east of
 * Greenwich: at 00:16 IST it still reports yesterday's date, so a "last 30
 * days" filter would silently drop everything billed after 5:30pm.
 */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function daysAgoKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateKey(date);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `10 Sep 2026` — a date the same way everywhere.
 *
 * `toLocaleDateString()` is the obvious choice and it is a trap in a server-
 * rendered app: Node formats with the server's locale and the browser with the
 * user's, so the two disagree and React reports a hydration mismatch on every
 * table of dates. Building the string from the parts removes the locale from
 * the equation entirely, and day-month-year is what an Indian shop reads
 * anyway.
 *
 * The parts are local-time parts, so this stays consistent with toDateKey and
 * does not drift a day either side of midnight the way a UTC slice would.
 */
export function formatDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `10 Sep 2026, 14:05` — the same rules as formatDate, plus a 24-hour clock. */
export function formatDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)}, ${hours}:${minutes}`;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * The inverse of formatDate/formatDateTime: reads `10 Sep 2026` or
 * `10 Sep 2026, 14:05` back into a timestamp, and returns null for anything
 * that isn't one of those.
 *
 * It lives next to the formatters on purpose. Report tables sort on the text
 * they display, so if the way a date is written ever changes, the thing that
 * reads it back has to change in the same edit — otherwise dates quietly start
 * sorting alphabetically by their day number.
 */
export function parseDisplayDate(text: string): number | null {
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})(?:, (\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const month = MONTH_INDEX[match[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(Number(match[3]), month, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0)).getTime();
}
