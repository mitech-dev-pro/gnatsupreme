import { useEffect, useId, useRef, type ReactNode } from "react";
import ModalPortal from "./ModalPortal";

export default function Dialog({
  title,
  description,
  busy = false,
  onClose,
  children,
  closeLabel,
}: {
  title: string;
  description?: ReactNode;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const current = useRef({ busy, onClose });
  useEffect(() => {
    current.current = { busy, onClose };
  }, [busy, onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!current.current.busy) current.current.onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ) ?? []),
      ].filter((node) => !node.closest('[hidden], [aria-hidden="true"]'));
      const first = nodes[0],
        last = nodes.at(-1);
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-1000 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-busy={busy}
          aria-labelledby={`${id}-title`}
          aria-describedby={description ? `${id}-description` : undefined}
          tabIndex={-1}
          className="max-h-full min-h-0 w-full max-w-xl overflow-y-auto rounded-xl border border-border-default bg-(--surface-raised) p-5 shadow-dropdown"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="text-lg font-bold text-text-strong">
                {title}
              </h2>
              {description && (
                <div
                  id={`${id}-description`}
                  className="mt-1 text-sm text-text-muted wrap-break-word"
                >
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={closeLabel ?? `Close ${title.toLowerCase()}`}
              disabled={busy}
              onClick={onClose}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-xl text-text-muted hover:bg-surface-subtle disabled:opacity-50"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}
