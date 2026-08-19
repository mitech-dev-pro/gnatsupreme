// apps/web/src/lib/options.ts
import type { DropdownOption } from "@/components/ui/Dropdown";

export function mapToOptions<T>(
  items: T[],
  getLabel: (item: T) => string,
  getValue: (item: T) => string | number
): DropdownOption[] {
  return items.map((item) => ({
    label: getLabel(item),
    value: getValue(item),
  }));
}
