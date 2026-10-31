import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

const inputClasses =
  "w-full rounded-lg border border-border-default bg-text-on-action py-[11px] px-3 text-sm transition-[border-color,box-shadow] duration-150 ease-out focus:border-action-primary focus:shadow-focus-soft focus:outline-none";

export default function ResetPassword() {
  const { resetPassword: resetMemberPassword } = useMemberAuth();
  const { resetPassword: resetStaffPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  // Staff and member reset emails share this one page/URL shape -- audience is how the staff
  // link (auth.routes.ts /forgot-password) distinguishes itself; its absence keeps every
  // already-sent member reset link (no audience param) behaving exactly as before.
  const isStaff = searchParams.get("audience") === "staff";
  const resetPassword = isStaff ? resetStaffPassword : resetMemberPassword;
  const signInLink = isStaff ? "/login" : "/login?mode=member";
  // Staff passwords require 12+ characters with upper/lowercase, a number, and a symbol
  // (staffPasswordSchema); members only require 8+ (memberPasswordSchema). The server is the
  // source of truth either way -- this just avoids a pointless round trip for an obviously
  // too-short password.
  const minLength = isStaff ? 12 : 8;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < minLength) {
      setError(`Password must be at least ${minLength} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await resetPassword(token, password);
      setMessage(res.message);
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="w-full max-w-100 rounded-2xl border border-white/10 bg-white p-8 shadow-dialog">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight text-text-strong">
          Reset your password
        </h1>

        {!token ? (
          <>
            <div className="mb-5 text-sm leading-relaxed text-text-muted">
              This reset link is missing or invalid. Request a new one from the sign-in page.
            </div>
            <Link
              to={signInLink}
              className="block w-full rounded-lg bg-action-primary py-2.5 text-center text-sm font-bold text-white shadow-action transition hover:bg-success"
            >
              Back to sign in
            </Link>
          </>
        ) : message ? (
          <>
            <div className="mb-5 rounded-lg bg-success-soft px-2.5 py-2 text-sm font-semibold text-success">
              {message}
            </div>
            <Link
              to={signInLink}
              className="block w-full rounded-lg bg-action-primary py-2.5 text-center text-sm font-bold text-white shadow-action transition hover:bg-success"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            <div className="mb-5 text-sm leading-relaxed text-text-muted">
              {isStaff
                ? "Choose a new password for your staff account."
                : "Choose a new password for your membership."}
            </div>

            {error && (
              <div className="mb-3 rounded-lg bg-danger-soft px-2.5 py-2 text-xs font-semibold text-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3.5">
                <label
                  htmlFor="new-password"
                  className="mb-1 block text-xs font-bold text-text-strong"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${minLength} characters`}
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </div>
              <div className="mb-4">
                <label
                  htmlFor="confirm-password"
                  className="mb-1 block text-xs font-bold text-text-strong"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save New Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
