import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatCurrency(amount: number, currency = "GHS"): string {
  return `${currency} ${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(2)}%`;
}

export function memberFullName(m: {
  firstName: string;
  lastName: string;
}): string {
  return `${m.firstName} ${m.lastName}`;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: "green",
    approved: "green",
    success: "green",
    paid: "green",
    settled: "green",
    pending: "yellow",
    inactive: "gray",
    rejected: "red",
    failed: "red",
    defaulted: "red",
    disinvested: "purple",
    missed: "red",
  };
  return map[status] ?? "gray";
}
