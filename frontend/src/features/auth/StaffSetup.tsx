import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action py-[11px] px-3 text-[13px] transition-[border-color,box-shadow] duration-150 ease-out focus:border-action-primary focus:shadow-focus-soft focus:outline-none";

export default function StaffSetup() {
  const { user, isLoading, completeSetup } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Already set up -- nothing for this screen to do.
  if (!user.setupRequired) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await completeSetup({ currentPassword, newPassword });
      setMessage("Account set up.");
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to finish setting up your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="w-full max-w-110 rounded-2xl border border-white/10 bg-white p-8 shadow-dialog">
        <h1 className="mb-1 text-xl font-extrabold tracking-tight text-text-strong">
          Finish setting up your account
        </h1>
        <div className="mb-5 text-[12.5px] leading-relaxed text-text-muted">
          Replace your temporary password before continuing.
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
                  Temporary password
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
              <div className="mb-4">
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
      </div>
    </div>
  );
}
