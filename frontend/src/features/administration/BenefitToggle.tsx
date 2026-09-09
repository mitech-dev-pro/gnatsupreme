export function BenefitToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} ${checked ? "enabled" : "disabled"}`}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-8 min-w-18.5 items-center justify-between gap-2 rounded-full border px-2.5 py-1 text-xs font-bold transition focus:outline-none focus-visible:shadow-focus-soft ${
        checked
          ? "border-action-primary bg-success-soft text-success"
          : "border-[#d7dce5] bg-surface-subtle text-text-muted"
      }`}
    >
      <span>{checked ? "On" : "Off"}</span>
      <span
        aria-hidden="true"
        className={`size-3.5 rounded-full ${checked ? "bg-action-primary" : "bg-[#9aa3b2]"}`}
      />
    </button>
  );
}
