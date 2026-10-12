import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-action-primary text-text-on-action shadow-control hover:bg-(--action-primary-hover)",
  secondary:
    "border-border-default bg-(--surface-raised) text-text-strong hover:border-border-strong hover:bg-surface-subtle",
  danger: "border-danger bg-(--surface-raised) text-danger hover:bg-danger-soft",
  ghost:
    "border-transparent bg-transparent text-text-muted hover:bg-surface-subtle hover:text-text-strong",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel = "Working…",
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-bold transition-[background-color,border-color,color,box-shadow] duration-180 ease-out focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {loading ? loadingLabel : children}
    </button>
  );
}
