export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export function validDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)
  )
    return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === value.slice(0, 19)
  );
}
export function hours(start?: string, end?: string): number | undefined {
  return start && end && validDate(start) && validDate(end)
    ? Math.max(0, (Date.parse(end) - Date.parse(start)) / HOUR)
    : undefined;
}
export function duration(value?: number) {
  if (value === undefined) return "Нет данных";
  if (value < 1) return "< 1 ч";
  if (value < 48) return `${Math.floor(value)} ч`;
  if (value < 336) return `${Math.floor(value / 24)} д`;
  return `${Math.floor(value / 168)} нед`;
}
export function dateLabel(value?: string, time = false) {
  if (!value) return "Не задан";
  return new Intl.DateTimeFormat(
    "ru-RU",
    time
      ? {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      : { day: "numeric", month: "short" },
  ).format(new Date(value));
}
export function localInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function inputISO(value: string) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}
// Legacy dates have day precision only. Preserve that fact in migration notes.
export function legacyDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!m) return validDate(value) ? value : undefined;
  const [, day, month, year] = m;
  const d = new Date(Date.UTC(+year, +month - 1, +day));
  return d.getUTCFullYear() === +year &&
    d.getUTCMonth() === +month - 1 &&
    d.getUTCDate() === +day
    ? d.toISOString()
    : undefined;
}
