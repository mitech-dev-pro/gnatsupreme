import { isAccountPending, useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action py-[11px] px-3 text-[13px] transition-[border-color,box-shadow] duration-150 ease-out focus:border-action-primary focus:shadow-focus-soft focus:outline-none";

export default function StaffSetup() {
  const { user, isLoading, completeSetup, resendVerificationEmail } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Prefilled from pendingEmail so re-running setup (e.g. after a typo) doesn't require
  // retyping the address that's already pending confirmation.
  const [email, setEmail] = useState(user?.pendingEmail ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Already fully set up -- nothing for this screen to do (mirrors the backend's own
  // reachability guard: setupRequired === true || email === null).
  if (!isAccountPending(user)) {
    return <Navigate to="/" replace />;
  }

  const needsNewPassword = user.setupRequired;
  const needsEmail = user.email === null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (needsNewPassword) {
      if (newPassword.length < 8) {
        setError("New password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New passwords do not match.");
        return;
      }
    }
    if (needsEmail && !email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);
    try {
      await completeSetup({
        currentPassword,
        newPassword: needsNewPassword ? newPassword : undefined,
        email: needsEmail || email.trim() !== (user.pendingEmail ?? "") ? email.trim() : undefined,
      });
      setMessage(
        needsEmail
          ? "Account set up. Check your email for a link to confirm your address."
          : "Account set up.",
      );
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to finish setting up your account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResendError("");
    setResendMessage("");
    setResending(true);
    try {
      await resendVerificationEmail();
      setResendMessage("A new confirmation email has been sent.");
    } catch (err: unknown) {
      setResendError(getApiError(err)?.message || "Unable to resend the confirmation email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="w-full max-w-110 rounded-2xl border border-white/10 bg-white p-8 shadow-dialog">
        <h1 className="mb-1 text-xl font-extrabold tracking-tight text-text-strong">
          Finish setting up your account
        </h1>
        <div className="mb-5 text-[12.5px] leading-relaxed text-text-muted">
          {needsNewPassword
            ? "Replace your temporary password and confirm an email address before continuing."
            : "Confirm an email address for your account."}
        </div>

        {message ? (
          <div className="rounded-lg bg-success-soft px-2.5 py-2 text-[12.5px] font-semibold text-success">
            {message}
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-3 rounded-lg bg-danger-soft px-2.5 py-2 text-[12px] font-semibold text-danger">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3.5">
                <label
                  htmlFor="setup-current-password"
                  className="mb-1 block text-[11.5px] font-bold text-text-strong"
                >
                  {needsNewPassword ? "Temporary password" : "Current password"}
                </label>
                <input
                  id="setup-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputClasses}
                />
              </div>

              {needsNewPassword && (
                <>
                  <div className="mb-3.5">
                    <label
                      htmlFor="setup-new-password"
                      className="mb-1 block text-[11.5px] font-bold text-text-strong"
                    >
                      New password
                    </label>
                    <input
                      id="setup-new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className={inputClasses}
                    />
                  </div>
                  <div className="mb-3.5">
                    <label
                      htmlFor="setup-confirm-password"
                      className="mb-1 block text-[11.5px] font-bold text-text-strong"
                    >
                      Confirm new password
                    </label>
                    <input
                      id="setup-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className={inputClasses}
                    />
                  </div>
                </>
              )}

              {needsEmail && (
                <div className="mb-4">
                  <label
                    htmlFor="setup-email"
                    className="mb-1 block text-[11.5px] font-bold text-text-strong"
                  >
                    Email
                  </label>
                  <input
                    id="setup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className={inputClasses}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-action-primary py-2.5 text-[13px] font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Continue"}
              </button>
            </form>
          </>
        )}

        {user.pendingEmail && (
          <div className="mt-4 border-t border-border-default pt-4">
            <div className="mb-2 text-[12px] text-text-muted">
              Confirmation email sent to <span className="font-semibold">{user.pendingEmail}</span>.
              Didn't get it, or typed the wrong address? Fix the address above and submit, or
              resend to the same address:
            </div>
            {resendMessage && (
              <div className="mb-2 rounded-lg bg-success-soft px-2.5 py-2 text-[12px] font-semibold text-success">
                {resendMessage}
              </div>
            )}
            {resendError && (
              <div className="mb-2 rounded-lg bg-danger-soft px-2.5 py-2 text-[12px] font-semibold text-danger">
                {resendError}
              </div>
            )}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full rounded-lg border border-border-default bg-text-on-action py-2 text-[12.5px] font-semibold text-text-strong transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resending ? "Sending…" : "Resend confirmation email"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
