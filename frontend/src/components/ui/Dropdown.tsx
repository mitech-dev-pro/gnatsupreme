import { useEffect, useRef, useState, type FC, type KeyboardEvent } from "react";

export interface DropdownOption {
  label: string;
  value: string | number;
}

export interface DropdownGroup {
  label: string;
  options: DropdownOption[];
}

interface DropdownProps {
  value: string | number;
  /** Flat option list. Ignored when `groups` is provided. */
  options?: DropdownOption[];
  /** Renders options under labeled, non-selectable group headers (e.g. districts by region). */
  groups?: DropdownGroup[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  dropdownCategory?: string;
  isOptional?: boolean;
  /** Lets a <label htmlFor> target the trigger button. */
  id?: string;
  "aria-label"?: string;
}

const Dropdown: FC<DropdownProps> = ({
  value,
  options,
  groups,
  onChange,
  className = "",
  placeholder = "Select an option",
  disabled = false,
  error = false,
  dropdownCategory = "option",
  isOptional = false,
  id,
  "aria-label": ariaLabel,
}) => {
  const flatOptions = groups ? [...(options ?? []), ...groups.flatMap((g) => g.options)] : (options ?? []);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">(
    "bottom",
  );
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current && listRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const listHeight = listRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;

      if (spaceBelow < listHeight && spaceAbove > listHeight) {
        setDropdownPosition("top");
      } else {
        setDropdownPosition("bottom");
      }
    }
  }, [isOpen, flatOptions.length]);

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
    } else {
      const selectedIndex = flatOptions.findIndex((opt) => opt.value === value);
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, value, groups, options]);

  useEffect(() => {
    if (focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [focusedIndex]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) setIsOpen(true);
        else
          setFocusedIndex((prev) => (prev < flatOptions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) setIsOpen(true);
        else
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : flatOptions.length - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!isOpen) setIsOpen(true);
        else if (focusedIndex >= 0) {
          onChange(String(flatOptions[focusedIndex]?.value));
          setIsOpen(false);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const selectedOption = flatOptions.find((opt) => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-[9px] border bg-(--surface-raised) px-3 py-2 text-[12.5px] transition-[border-color,box-shadow] duration-180 focus:outline-none focus:ring-3 focus:ring-(--success-soft) ${
          disabled
            ? "cursor-not-allowed border-(--border-default) bg-(--surface-subtle) text-(--text-muted)"
            : error
              ? "border-(--danger) text-(--ink) hover:bg-(--surface-subtle)"
              : "border-(--border-default) text-(--ink) hover:border-(--border-strong) focus:border-(--action-primary)"
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? `Select ${value || placeholder}${isOptional ? " (Optional)" : ""}`}
        disabled={disabled}
      >
        <span className={`truncate ${value ? "text-(--ink)" : "text-(--text-muted)"}`}>
          {selectedOption
            ? selectedOption.label
            : placeholder + (isOptional ? " (Optional)" : "")}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-4 shrink-0 transition-transform ${disabled ? "text-(--border-strong)" : error ? "text-(--danger)" : "text-(--text-muted)"} ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <div
          ref={listRef}
          className={`absolute z-20 flex max-h-60 w-full flex-col overflow-auto rounded-[9px] border border-(--border-default) bg-(--surface-raised) shadow-[0_14px_34px_rgba(30,39,97,0.18)] ${
            dropdownPosition === "top" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          role="listbox"
          aria-activedescendant={
            focusedIndex >= 0 ? `option-${focusedIndex}` : undefined
          }
        >
          {flatOptions.length === 0 ? (
            <span className="block px-3 py-2 text-[12.5px] text-(--text-muted)">
              No {dropdownCategory} available
            </span>
          ) : (
            (() => {
              let index = -1;
              const renderOption = (option: DropdownOption) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={option.value}
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    id={`option-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(String(option.value));
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setFocusedIndex(i)}
                    className={`w-full cursor-pointer px-3 py-2 text-left text-[12.5px] transition-colors focus:outline-none ${
                      focusedIndex === i
                        ? "bg-(--success-soft) text-(--action-primary-hover)"
                        : "text-(--ink) hover:bg-(--surface-subtle)"
                    }`}
                    role="option"
                    aria-selected={value === option.value}
                  >
                    {option.label}
                  </button>
                );
              };

              return groups ? (
                <>
                  {(options ?? []).map(renderOption)}
                  {groups.map((group) => (
                    <div key={group.label} role="group" aria-label={group.label}>
                      <div className="sticky top-0 bg-(--surface-raised) px-3 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wide text-(--text-muted)">
                        {group.label}
                      </div>
                      {group.options.map(renderOption)}
                    </div>
                  ))}
                </>
              ) : (
                (options ?? []).map(renderOption)
              );
            })()
          )}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
