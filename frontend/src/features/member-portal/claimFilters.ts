import { toISODate } from "@/lib/utils";

/** Portal timestamps use the same local calendar date shown in the Filed On column. */
export function filedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toISODate(date);
}

/** Provider dates are wall-clock values. Unknown formats cannot satisfy a date filter. */
export function insurerDate(value: string | null): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}(?=$|[T ])/u)?.[0] ?? "";
}

export function inDateRange(value: string, from: string, through: string): boolean {
  return (
    (!from && !through) ||
    Boolean(value && (!from || value >= from) && (!through || value <= through))
  );
}
