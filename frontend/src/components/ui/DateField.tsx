import type { ComponentProps } from "react";
import DatePicker from "./DatePicker";
import { parseISODate, toISODate } from "@/lib/utils";

/** Date-only form values stay in the API's YYYY-MM-DD format, without UTC conversion. */
export default function DateField({
  value,
  onChange,
  min,
  max,
  ...props
}: Omit<ComponentProps<typeof DatePicker>, "value" | "onChange" | "minDate" | "maxDate"> & {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <DatePicker
      {...props}
      value={parseISODate(value)}
      onChange={(date) => onChange(date ? toISODate(date) : "")}
      minDate={parseISODate(min)}
      maxDate={parseISODate(max) ?? undefined}
    />
  );
}
