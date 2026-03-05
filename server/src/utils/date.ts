import { DateTime } from "luxon";

export function toDateTime(value: Date | string | DateTime | null | undefined): DateTime | null {
  if (!value) return null;
  
  if (value instanceof DateTime) {
    return value;
  }
  
  if (value instanceof Date) {
    return DateTime.fromJSDate(value);
  }
  
  if (typeof value === "string") {
    return DateTime.fromISO(value) || DateTime.fromSQL(value);
  }
  
  return null;
}

export function toDate(value: DateTime | Date | string | null | undefined): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof DateTime) {
    return value.toJSDate();
  }

  if (typeof value === "string") {
    const dt = DateTime.fromISO(value) || DateTime.fromSQL(value);
    return dt ? dt.toJSDate() : null;
  }

  return null;
}

export function toMillis(value: DateTime | Date | string | null | undefined): number | null {
  const dt = toDateTime(value);
  return dt ? dt.toMillis() : null;
}

export function toISOString(value: DateTime | Date | string | null | undefined): string | null {
  const dt = toDateTime(value);
  return dt ? dt.toISO() : null;
}

export function formatGermanDate(value: Date | string | DateTime | null | undefined): string {
  const dt = toDateTime(value);
  return dt ? dt.toFormat("dd.MM.yyyy") : "";
}

export function formatLocaleDate(value: Date | string | DateTime | null | undefined): string {
  const dt = toDateTime(value);
  return dt ? dt.toLocaleString() : "";
}

export function diffDays(startDate: Date | string | DateTime, endDate: Date | string | DateTime): number {
  const start = toDateTime(startDate);
  const end = toDateTime(endDate);
  
  if (!start || !end) return 0;
  
  return end.diff(start, "days").days;
}

export function getYear(value: Date | string | DateTime | null | undefined): number {
  const dt = toDateTime(value);
  return dt ? dt.year : 0;
}