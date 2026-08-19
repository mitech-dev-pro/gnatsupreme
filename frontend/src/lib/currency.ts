// apps/web/src/lib/currency.ts

export interface CurrencyOption {
  value: string;
  label: string;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { value: "GHS", label: "GHS - Ghanaian Cedi", symbol: "₵" },
  { value: "USD", label: "USD - US Dollar", symbol: "$" },
  { value: "EUR", label: "EUR - Euro", symbol: "€" },
  { value: "GBP", label: "GBP - British Pound", symbol: "£" },
  { value: "NGN", label: "NGN - Nigerian Naira", symbol: "₦" },
  { value: "ZAR", label: "ZAR - South African Rand", symbol: "R" },
  { value: "KES", label: "KES - Kenyan Shilling", symbol: "KSh" },
];

export const DEFAULT_CURRENCY = "GHS";

export function getCurrencySymbol(code: string): string {
  const currency = CURRENCIES.find((c) => c.value === code);
  return currency?.symbol ?? code;
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string {
  const num =
    typeof amount === "string" ? Number.parseFloat(amount) : (amount ?? 0);

  if (!Number.isFinite(num)) {
    return `${getCurrencySymbol(currency)}0.00`;
  }

  const symbol = getCurrencySymbol(currency);
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatted}`;
}

export function getCurrencyDropdownOptions() {
  return CURRENCIES.map((c) => ({
    value: c.value,
    label: c.label,
  }));
}
