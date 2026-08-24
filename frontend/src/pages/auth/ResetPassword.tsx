import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMemberAuth } from "@/lib/MemberAuthContext";

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] py-[11px] px-3 text-[13px] transition-[border-color,box-shadow] duration-150 ease-out focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";

export default function ResetPassword() {
  const { resetPassword } = useMemberAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
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
    } catch (err: any) {
      setError(err?.response?.data?.message || "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="w-full max-w-100 rounded-[18px] border border-white/10 bg-white p-8 shadow-[0_24px_60px_rgba(10,14,40,0.35)]">
        <h1 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
          Reset your password
        </h1>

        {!token ? (
          <>
            <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
              This reset link is missing or invalid. Request a new one from the sign-in page.
            </div>
            <Link
              to="/login?mode=member"
              className="block w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-center text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f]"
            >
              Back to sign in
            </Link>
          </>
        ) : message ? (
          <>
            <div className="mb-5 rounded-lg bg-[#dff7ee] px-2.5 py-2 text-[12.5px] font-semibold text-[#17805f]">
              {message}
            </div>
            <Link
              to="/login?mode=member"
              className="block w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-center text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f]"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
              Choose a new password for your membership.
            </div>

            {error && (
              <div className="mb-3 rounded-lg bg-[#fbe9e9] px-2.5 py-2 text-[12px] font-semibold text-[#c23b3b]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3.5">
                <label htmlFor="new-password" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className={inputClasses}
                />
              </div>
              <div className="mb-4">
                <label htmlFor="confirm-password" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
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
                className="w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
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
