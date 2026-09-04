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
    <label className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[7px] border border-(--mint-border,var(--border-default)) bg-(--surface-subtle) px-2.5 text-[11px] font-bold text-(--action-primary) hover:border-(--action-primary) ${disabled || busy ? "pointer-events-none opacity-60" : ""}`}>
      <span>{busy ? "Uploading…" : label}</span>
      <input
        type="file"
        className="sr-only"
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
