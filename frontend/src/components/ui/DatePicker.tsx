import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent,
  MouseEvent,
  SVGProps,
} from "react";
import ModalPortal from "./ModalPortal";
import { cn } from "@/lib/utils";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {children}
    </svg>
  );
}
const CalendarIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M16 3v4M8 3v4M3.5 10h17" /></Icon>
);
const ChevronLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}><path d="M15 6l-6 6 6 6" /></Icon>
);
const ChevronRightIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}><path d="M9 6l6 6-6 6" /></Icon>
);
const ChevronsLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}><path d="M18 6l-6 6 6 6M11 6l-6 6 6 6" /></Icon>
);
const ChevronsRightIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}><path d="M6 6l6 6-6 6M13 6l6 6-6 6" /></Icon>
);
const XIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}><path d="M6 6l12 12M18 6L6 18" /></Icon>
);

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date | null;
  maxDate?: Date;
  disabled?: boolean;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Format the displayed date. Defaults to "MMM D, YYYY" */
  formatDate?: (date: Date) => string;
}

type View = "days" | "months" | "years";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH_NAMES = [
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

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function defaultFormatDate(date: Date): string {
  return `${SHORT_MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function generateYearRange(centerYear: number): number[] {
  const start = Math.floor(centerYear / 12) * 12;
  return Array.from({ length: 12 }, (_, i) => start + i);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function makeDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseDateText(text: string): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return makeDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const gbMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (gbMatch) {
    return makeDate(Number(gbMatch[3]), Number(gbMatch[2]), Number(gbMatch[1]));
  }

  if (!/[a-z]/i.test(trimmed) || !/\d{4}/.test(trimmed)) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return makeDate(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
  );
}

const inputClasses =
  "w-full min-h-10 rounded-[9px] border border-(--border-default) bg-(--surface-raised) px-3 py-2 pr-9 text-[12.5px] text-(--ink) transition-[border-color,box-shadow] duration-180 focus:border-(--action-primary) focus:outline-none focus:ring-3 focus:ring-(--success-soft) disabled:cursor-not-allowed disabled:bg-(--surface-subtle) disabled:text-(--text-muted)";

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  minDate,
  maxDate,
  disabled = false,
  label,
  hint,
  error,
  required = false,
  className,
  formatDate = defaultFormatDate,
}: DatePickerProps) {
  const today = new Date();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("days");
  const [inputValue, setInputValue] = useState(() =>
    value ? formatDate(value) : "",
  );
  const [inputInvalid, setInputInvalid] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => ({
    year: value?.getFullYear() ?? today.getFullYear(),
    month: value?.getMonth() ?? today.getMonth(),
  }));
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updateFloatingPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const margin = 8;
    const width = 292;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const left = Math.min(
      Math.max(rect.left, margin),
      Math.max(margin, viewportWidth - width - margin),
    );

    const popoverHeight = popoverRef.current?.offsetHeight ?? 360;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < popoverHeight + margin && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(margin, rect.top - popoverHeight - 4)
      : Math.min(rect.bottom + 4, Math.max(margin, viewportHeight - popoverHeight - margin));

    setFloatingStyle({ left, top, width });
  }, []);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;

    // Two passes: the first positions against an estimated height before the
    // popover has painted, the second re-measures its real (view-dependent) height.
    updateFloatingPosition();
    const raf = requestAnimationFrame(updateFloatingPosition);
    window.addEventListener("resize", updateFloatingPosition);
    window.addEventListener("scroll", updateFloatingPosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateFloatingPosition);
      window.removeEventListener("scroll", updateFloatingPosition, true);
    };
  }, [open, view, cursor.year, cursor.month, updateFloatingPosition]);

  useEffect(() => {
    if (value) {
      setCursor({ year: value.getFullYear(), month: value.getMonth() });
    }
    setInputValue(value ? formatDate(value) : "");
    setInputInvalid(false);
  }, [formatDate, value]);

  const prevMonth = useCallback(() => {
    setCursor((c) => {
      const d = new Date(c.year, c.month - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const nextMonth = useCallback(() => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const selectDate = useCallback(
    (day: number) => {
      const date = new Date(cursor.year, cursor.month, day);
      onChange?.(date);
      setInputValue(formatDate(date));
      setInputInvalid(false);
      setOpen(false);
      setView("days");
    },
    [cursor, formatDate, onChange],
  );

  const clearDate = useCallback(
    (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      onChange?.(null);
      setInputValue("");
      setInputInvalid(false);
    },
    [onChange],
  );

  const isOutOfRange = useCallback(
    (date: Date) => {
      if (minDate && date < startOfDay(minDate)) return true;
      if (maxDate && date > endOfDay(maxDate)) return true;
      return false;
    },
    [minDate, maxDate],
  );

  const commitInput = useCallback(
    (text: string, normalize = false) => {
      const nextText = text.trim();
      if (!nextText) {
        onChange?.(null);
        setInputValue("");
        setInputInvalid(false);
        return;
      }

      const parsed = parseDateText(nextText);
      if (!parsed || isOutOfRange(parsed)) {
        setInputInvalid(true);
        if (normalize) setInputValue(value ? formatDate(value) : "");
        return;
      }

      onChange?.(parsed);
      setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() });
      setInputValue(formatDate(parsed));
      setInputInvalid(false);
    },
    [formatDate, isOutOfRange, onChange, value],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value;
      setInputValue(text);
      setInputInvalid(false);

      const parsed = parseDateText(text);
      if (parsed && !isOutOfRange(parsed)) {
        onChange?.(parsed);
        setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() });
      }
    },
    [isOutOfRange, onChange],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitInput(inputValue, true);
        setOpen(false);
      }

      if (event.key === "Escape") {
        setInputValue(value ? formatDate(value) : "");
        setInputInvalid(false);
        setOpen(false);
      }
    },
    [commitInput, formatDate, inputValue, value],
  );

  const isDisabledDay = useCallback(
    (day: number) => {
      const date = new Date(cursor.year, cursor.month, day);
      return isOutOfRange(date);
    },
    [cursor, isOutOfRange],
  );

  const daysInMonth = getDaysInMonth(cursor.year, cursor.month);
  const firstDay = getFirstDayOfMonth(cursor.year, cursor.month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const yearRange = generateYearRange(cursor.year);

  return (
    <div
      ref={containerRef}
      className={cn("relative flex w-full flex-col gap-1", className)}
    >
      {label && (
        <label htmlFor={id} className="mb-0.5 block text-[11.5px] font-bold text-(--text-strong)">
          {label}
          {required && <span aria-hidden="true" className="ml-0.5 text-(--danger)">*</span>}
        </label>
      )}

      <div ref={triggerRef} className="relative w-full">
        <input
          id={id}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => commitInput(inputValue, true)}
          onKeyDown={handleInputKeyDown}
          aria-invalid={Boolean(error || inputInvalid) || undefined}
          className={cn(
            inputClasses,
            (inputInvalid || error) && "border-(--danger) focus:border-(--danger) focus:ring-(--danger-soft)",
          )}
        />

        <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
          {value && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              onClick={clearDate}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={(e) => e.key === "Enter" && clearDate(e)}
              className="rounded p-0.5 text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
            >
              <XIcon className="size-3.5" />
            </span>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label="Open calendar"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen((o) => !o)}
              className={cn(
                "transition-colors",
                open ? "text-(--action-primary)" : "text-(--text-muted) hover:text-(--text-strong)",
              )}
            >
              <CalendarIcon className="size-4" />
            </button>
          )}
        </span>
      </div>
      {error && <p className="text-[11.5px] font-semibold text-(--danger)">{error}</p>}
      {hint && !error && <p className="text-[11.5px] text-(--text-muted)">{hint}</p>}

      {open && (
        <ModalPortal>
          <div
            ref={popoverRef}
            style={floatingStyle}
            className="fixed z-1000 rounded-[12px] border border-(--border-default) bg-(--surface-raised) p-3 shadow-[0_14px_34px_rgba(30,39,97,0.18)]"
          >
            {view === "days" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="flex size-8 items-center justify-center rounded-[9px] text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    aria-label="Previous month"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>

                  <div className="flex items-center rounded-[9px]">
                    <button
                      type="button"
                      onClick={() => setView("months")}
                      className="rounded-l-[9px] px-2 py-1 text-[12.5px] font-bold text-(--text-strong) transition-colors hover:bg-(--surface-subtle) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    >
                      {MONTH_NAMES[cursor.month]}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("years")}
                      className="rounded-r-[9px] px-2 py-1 text-[12.5px] font-bold text-(--action-primary) transition-colors hover:bg-(--success-soft) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    >
                      {cursor.year}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={nextMonth}
                    className="flex size-8 items-center justify-center rounded-[9px] text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    aria-label="Next month"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>

                <div className="mb-1 grid grid-cols-7">
                  {DAY_NAMES.map((d) => (
                    <div
                      key={d}
                      className="py-1 text-center text-[10.5px] font-bold uppercase tracking-wide text-(--text-muted)"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5">
                  {Array.from({ length: totalCells }, (_, i) => {
                    const day = i - firstDay + 1;
                    const isCurrentMonth = day >= 1 && day <= daysInMonth;
                    const dateObj = isCurrentMonth
                      ? new Date(cursor.year, cursor.month, day)
                      : null;
                    const selected =
                      value && dateObj ? isSameDay(value, dateObj) : false;
                    const todayFlag = dateObj ? isToday(dateObj) : false;
                    const disabledFlag = isCurrentMonth
                      ? isDisabledDay(day)
                      : true;

                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!isCurrentMonth || disabledFlag}
                        onClick={() =>
                          isCurrentMonth && !disabledFlag && selectDate(day)
                        }
                        className={cn(
                          "relative flex h-9 w-full items-center justify-center rounded-[9px] text-[12.5px] transition-colors select-none focus:outline-none focus:ring-2 focus:ring-(--focus-ring)",
                          !isCurrentMonth
                            ? "pointer-events-none opacity-0"
                            : selected
                              ? "bg-(--action-primary) font-bold text-(--text-on-action) shadow-sm"
                              : todayFlag
                                ? "bg-(--success-soft) font-bold text-(--success) ring-1 ring-(--success-border)"
                                : disabledFlag
                                  ? "cursor-not-allowed text-(--border-strong)"
                                  : "text-(--ink) hover:bg-(--surface-subtle)",
                        )}
                      >
                        {isCurrentMonth ? day : ""}
                        {todayFlag && !selected && (
                          <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-(--action-primary)" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-(--border-default) pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const t = new Date();
                      setCursor({ year: t.getFullYear(), month: t.getMonth() });
                      onChange?.(t);
                      setOpen(false);
                    }}
                    className="text-[11.5px] font-bold text-(--action-primary) transition-colors hover:text-(--action-primary-hover) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                  >
                    Today
                  </button>
                  {value && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange?.(null);
                        setOpen(false);
                      }}
                      className="text-[11.5px] font-semibold text-(--text-muted) transition-colors hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}

            {view === "months" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setCursor((c) => ({ ...c, year: c.year - 1 }))
                    }
                    className="flex size-8 items-center justify-center rounded-[9px] text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    aria-label="Previous year"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("years")}
                    className="rounded-[9px] px-3 py-1 text-[12.5px] font-bold text-(--text-strong) transition-colors hover:bg-(--surface-subtle) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                  >
                    {cursor.year}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCursor((c) => ({ ...c, year: c.year + 1 }))
                    }
                    className="flex size-8 items-center justify-center rounded-[9px] text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    aria-label="Next year"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {MONTH_NAMES.map((name, idx) => {
                    const isSelected =
                      value &&
                      value.getMonth() === idx &&
                      value.getFullYear() === cursor.year;
                    const isCurrent =
                      today.getMonth() === idx &&
                      today.getFullYear() === cursor.year;

                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setCursor((c) => ({ ...c, month: idx }));
                          setView("days");
                        }}
                        className={cn(
                          "h-10 rounded-[9px] text-[12.5px] transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus-ring)",
                          isSelected
                            ? "bg-(--action-primary) font-bold text-(--text-on-action) shadow-sm"
                            : isCurrent
                              ? "bg-(--success-soft) font-bold text-(--success) ring-1 ring-(--success-border)"
                              : "text-(--ink) hover:bg-(--surface-subtle)",
                        )}
                      >
                        {SHORT_MONTH_NAMES[idx]}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 border-t border-(--border-default) pt-3">
                  <button
                    type="button"
                    onClick={() => setView("days")}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-(--text-muted) transition-colors hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                  >
                    <ChevronLeftIcon className="size-3.5" /> Back
                  </button>
                </div>
              </>
            )}

            {view === "years" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setCursor((c) => ({ ...c, year: c.year - 12 }))
                    }
                    className="flex size-8 items-center justify-center rounded-[9px] text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    aria-label="Previous years"
                  >
                    <ChevronsLeftIcon className="size-4" />
                  </button>
                  <span className="text-[12.5px] font-bold text-(--text-strong)">
                    {yearRange[0]} - {yearRange[yearRange.length - 1]}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCursor((c) => ({ ...c, year: c.year + 12 }))
                    }
                    className="flex size-8 items-center justify-center rounded-[9px] text-(--text-muted) transition-colors hover:bg-(--surface-subtle) hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                    aria-label="Next years"
                  >
                    <ChevronsRightIcon className="size-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {yearRange.map((yr) => {
                    const isSelected = value && value.getFullYear() === yr;
                    const isCurrent = today.getFullYear() === yr;

                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => {
                          setCursor((c) => ({ ...c, year: yr }));
                          setView("months");
                        }}
                        className={cn(
                          "h-10 rounded-[9px] text-[12.5px] transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus-ring)",
                          isSelected
                            ? "bg-(--action-primary) font-bold text-(--text-on-action) shadow-sm"
                            : isCurrent
                              ? "bg-(--success-soft) font-bold text-(--success) ring-1 ring-(--success-border)"
                              : "text-(--ink) hover:bg-(--surface-subtle)",
                        )}
                      >
                        {yr}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 border-t border-(--border-default) pt-3">
                  <button
                    type="button"
                    onClick={() => setView("months")}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-(--text-muted) transition-colors hover:text-(--text-strong) focus:outline-none focus:ring-2 focus:ring-(--focus-ring)"
                  >
                    <ChevronLeftIcon className="size-3.5" /> Back
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
