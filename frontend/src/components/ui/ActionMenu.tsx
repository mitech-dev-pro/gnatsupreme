import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

type Item = { label: string; to?: string; onSelect?: () => void };
export default function ActionMenu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 192 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const focusLast = useRef(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const frame = requestAnimationFrame(() => {
      const nodes = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      (focusLast.current ? nodes?.[nodes.length - 1] : nodes?.[0])?.focus({ preventScroll: true });
    });
    document.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);
  const show = (last = false) => {
    focusLast.current = last;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const scale = rect.width / (trigger.current?.offsetWidth || rect.width) || 1,
        width = Math.min(192, window.innerWidth / scale - 16),
        height = items.length * 40 + 8;
      setPosition({
        width,
        left: Math.max(
          8,
          Math.min(rect.right / scale - width, window.innerWidth / scale - width - 8),
        ),
        top: Math.max(
          8,
          rect.bottom / scale + height > window.innerHeight / scale
            ? rect.top / scale - height - 4
            : rect.bottom / scale + 4,
        ),
      });
    }
    setOpen((value) => !value);
  };
  const select = (item: Item) => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
    item.onSelect?.();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="grid size-10 place-items-center rounded-lg text-lg leading-none text-text-muted hover:bg-surface-subtle aria-expanded:bg-surface-subtle"
        onClick={(event) => {
          event.stopPropagation();
          show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) show(event.key === "ArrowUp");
          }
        }}
      >
        •••
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            style={{ position: "fixed", ...position }}
            className="z-200 rounded-lg border border-border-default bg-(--surface-raised) p-1 shadow-dropdown"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const nodes = [
                  ...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
                ],
                index = nodes.indexOf(document.activeElement as HTMLElement);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                nodes[
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? nodes.length - 1
                      : (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length
                ]?.focus();
              }
              if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                }
                setOpen(false);
                trigger.current?.focus({ preventScroll: true });
              }
            }}
          >
            {items.map((item) =>
              item.to ? (
                <Link
                  key={item.label}
                  role="menuitem"
                  to={item.to}
                  className="block rounded-md px-3 py-2.5 text-sm font-semibold text-ink no-underline hover:bg-info-soft focus:bg-info-soft focus:outline-none"
                  onClick={() => select(item)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-info-soft focus:bg-info-soft focus:outline-none"
                  onClick={() => select(item)}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
