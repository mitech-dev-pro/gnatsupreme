import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { inputClasses, labelClasses } from "./MemberHome.shared";

export function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const navigate = useNavigate();
  const { logout } = useMemberAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/member-auth/change-password", { currentPassword, password });
      setDone(true);
      // The server revokes every session on a password change (same as the forgot-password
      // reset flow), so this device's own session is already dead -- log out locally and send
      // them to re-authenticate with the new password rather than leaving a stale session UI up.
      await logout();
      window.setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to change your password.");
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-3 rounded-xl border border-success-border bg-success-soft p-4 text-sm font-semibold text-success">
        Password updated. Redirecting you to sign in…
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-xl border border-border-default bg-surface-hover p-4"
    >
      <div>
        <label htmlFor={`${formId}-current`} className={labelClasses}>
          Current password
        </label>
        <input
          id={`${formId}-current`}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label htmlFor={`${formId}-new`} className={labelClasses}>
          New password
        </label>
        <input
          id={`${formId}-new`}
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label htmlFor={`${formId}-confirm`} className={labelClasses}>
          Confirm new password
        </label>
        <input
          id={`${formId}-confirm`}
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClasses}
          required
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-9 rounded-lg bg-action-primary px-4 text-xs font-bold text-white disabled:opacity-55"
        >
          {busy ? "Saving…" : "Save new password"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-9 rounded-lg border border-border-default px-4 text-xs font-bold text-text-muted disabled:opacity-55"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
