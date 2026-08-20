import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const controlClasses = "w-full min-h-10 rounded-[9px] border border-(--border-default) bg-(--surface-raised) px-3 py-2 text-[12.5px] text-(--ink) transition-[border-color,box-shadow] duration-180 focus:border-(--action-primary) focus:outline-none focus:ring-3 focus:ring-(--success-soft) disabled:cursor-not-allowed disabled:bg-(--surface-subtle) disabled:text-(--text-muted)";

function Frame({ id, label, hint, error, required, children }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-[11.5px] font-bold text-(--text-strong)">{label}{required && <span aria-hidden="true" className="ml-0.5 text-(--danger)">*</span>}</label>{children}{(hint || error) && <p id={`${id}-${error ? "error" : "hint"}`} className={`mt-1.5 text-[11.5px] ${error ? "font-semibold text-(--danger)" : "text-(--text-muted)"}`}>{error ?? hint}</p>}</div>;
}

export function InputField({ label, hint, error, id: providedId, className = "", required, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId(); const id = providedId ?? generatedId;
  return <Frame id={id} label={label} hint={hint} error={error} required={required}><input id={id} required={required} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`${controlClasses} ${error ? "border-(--danger)" : ""} ${className}`} {...props} /></Frame>;
}

export function SelectField({ label, hint, error, id: providedId, className = "", required, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId(); const id = providedId ?? generatedId;
  return <Frame id={id} label={label} hint={hint} error={error} required={required}><select id={id} required={required} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`${controlClasses} ${error ? "border-(--danger)" : ""} ${className}`} {...props}>{children}</select></Frame>;
}

export function TextareaField({ label, hint, error, id: providedId, className = "", required, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId(); const id = providedId ?? generatedId;
  return <Frame id={id} label={label} hint={hint} error={error} required={required}><textarea id={id} required={required} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`${controlClasses} min-h-24 resize-y ${error ? "border-(--danger)" : ""} ${className}`} {...props} /></Frame>;
}
