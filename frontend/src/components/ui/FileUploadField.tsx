import type { ReactNode } from "react";

type FileUploadFieldProps = {
  label: ReactNode;
  accept?: string;
  disabled?: boolean;
  busy?: boolean;
  onSelect: (file: File) => void;
};

export default function FileUploadField({ label, accept = ".pdf,.jpg,.jpeg,.png,.webp", disabled, busy, onSelect }: FileUploadFieldProps) {
  return (
    <label className={`relative inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[7px] border border-(--mint-border,var(--border-default)) bg-(--surface-subtle) px-2.5 text-[11px] font-bold text-(--action-primary) hover:border-(--action-primary) ${disabled || busy ? "pointer-events-none opacity-60" : ""}`}>
      <span>{busy ? "Uploading…" : label}</span>
      <input
        type="file"
        // A 1x1px `sr-only`-hidden file input still receives focus, and browsers scroll the
        // focused element into view when focus returns to it after the native file-picker
        // dialog closes -- with a near-zero-size clipped element that produces a visible page
        // jump. Sizing the (still invisible) input to cover the whole label instead avoids that
        // scroll-into-view behavior while keeping it functionally and visually identical.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        accept={accept}
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}
