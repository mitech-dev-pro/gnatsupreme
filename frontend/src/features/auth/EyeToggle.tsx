export function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      onClick={onToggle}
      className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition hover:bg-info-soft hover:text-text-strong focus:outline-none focus-visible:shadow-focus-soft"
    >
      {shown ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4"
        >
          <path d="m3 3 18 18" />
          <path
            d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c6 0 9.5 8 9.5 8a17 17 0 0 1-2.1 3.3M6.6 6.6C4 8.4 2.5 12 2.5 12S6 20 12 20c1.3 0 2.5-.4 3.6-1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="size-4"
        >
          <path
            d="M2.5 12S6 4 12 4s9.5 8 9.5 8S18 20 12 20 2.5 12 2.5 12Z"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )}
    </button>
  );
}
