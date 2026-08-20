import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useMemberAuth } from "@/lib/MemberAuthContext";

const FEATURES = [
  "Scoped access — see only your district, region, or the whole scheme",
  "Every action is logged to the audit trail",
  "Changes are saved automatically as you work",
];

const inputClasses =
  "w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] py-[11px] pl-9 pr-3 text-[13px] transition-[border-color,box-shadow] duration-150 ease-out focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none";

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-lg bg-[#fbe9e9] px-2.5 py-2 text-[12px] font-semibold text-[#c23b3b]">
      {message}
    </div>
  );
}

export default function Login() {
  const { user, isLoading, login } = useAuth();
  const {
    member,
    isLoading: memberLoading,
    requestOtp,
    verifyOtp,
  } = useMemberAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<"staff" | "member">("staff");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [memberStep, setMemberStep] = useState<"id" | "otp">("id");
  const [controllerId, setControllerId] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [memberError, setMemberError] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);

  if (isLoading || memberLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={searchParams.get("redirect") || "/"} replace />;
  }

  if (member) {
    return <Navigate to="/member" replace />;
  }

  const handleStaffSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Enter both an email and a password.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(searchParams.get("redirect") || "/", { replace: true });
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Unable to sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError("Enter a valid Controller ID (4 to 7 digits).");
      return;
    }

    setMemberSubmitting(true);
    try {
      const res = await requestOtp(controllerId.trim());
      setChallengeToken(res.challengeToken);
      setMemberStep("otp");
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message || "Unable to send a verification code.",
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!/^\d{6}$/.test(otp.trim())) {
      setMemberError("Enter the six-digit verification code.");
      return;
    }

    setMemberSubmitting(true);
    try {
      await verifyOtp(challengeToken, otp.trim());
      navigate("/member", { replace: true });
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message ||
          "The verification code is invalid or expired.",
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleMemberModeChange = (nextMode: "staff" | "member") => {
    setMode(nextMode);
    setMemberStep("id");
    setOtp("");
    setChallengeToken("");
    setMemberError("");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="grid w-full max-w-240 grid-cols-1 overflow-hidden rounded-[18px] border border-white/10 bg-white shadow-[0_24px_60px_rgba(10,14,40,0.35)] md:grid-cols-2">
        {/* Brand side */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(165deg,#1e2761_0%,#17805f_130%)] px-9 py-10 text-white md:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-15 -top-15 h-55 w-55 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_70%)]"
          />
          <div>
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-16 w-29 items-center justify-center rounded-[11px] bg-white px-2.5 py-1.5 shadow-[0_5px_16px_rgba(8,13,42,0.24)]">
                <img
                  src="/brand/gnat-logo.png?v=1"
                  alt="GNAT"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="h-10 w-px shrink-0 bg-white/20" />
              <div>
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/60">
                  Underwritten by
                </div>
                <div className="flex h-12 w-27 items-center justify-center rounded-[10px] bg-white px-2.5 py-1.5 shadow-[0_5px_16px_rgba(8,13,42,0.2)]">
                  <img
                    src="/brand/milife-logo.png?v=1"
                    alt="miLife Insurance"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>

            <div className="my-5 flex h-1.25 w-21 overflow-hidden rounded-[3px]">
              <span className="flex-1 bg-[#dff7ee]" />
              <span className="flex-1 bg-[#1f9c7c]" />
              <span className="flex-1 bg-[#b9791a]" />
              <span className="flex-1 bg-white" />
            </div>

            <h1 className="relative z-10 mb-2.5 text-[22px] font-extrabold tracking-tight">
              GNAT Supreme Care
            </h1>
            <p className="relative z-10 text-[13px] leading-relaxed text-white/80">
              Member Portal for GNAT's health scheme, underwritten with miLife
              Insurance. Sign in with your district, regional, or national
              administrator account.
            </p>

            {FEATURES.map((f) => (
              <div
                key={f}
                className="relative z-10 mt-4 flex items-start gap-2.5 text-[12.5px] text-white/90"
              >
                <div className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-white/12">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    className="h-3.25 w-3.25 text-[#dff7ee]"
                  >
                    <path d="M9 12.5 11 14.5 15.5 9" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </div>
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-6 text-[10.5px] text-white/55">
            Sign in with the staff account issued to you by GNAT Supreme Care.
          </div>
        </div>

        {/* Form side */}
        <div className="flex flex-col px-9 py-10">
          <div className="mb-5.5 flex gap-1 rounded-[11px] bg-[#eef0fa] p-1">
            <button
              type="button"
              onClick={() => handleMemberModeChange("staff")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-bold transition ${
                mode === "staff"
                  ? "bg-white text-[#1e2761] shadow-[0_1px_3px_rgba(30,39,97,0.15)]"
                  : "bg-transparent text-[#5b6472]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className={`h-3.5 w-3.5 ${mode === "staff" ? "text-[#17805f] opacity-100" : "opacity-75"}`}
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 4v5" />
              </svg>
              Staff Login
            </button>
            <button
              type="button"
              onClick={() => handleMemberModeChange("member")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-bold transition ${
                mode === "member"
                  ? "bg-white text-[#1e2761] shadow-[0_1px_3px_rgba(30,39,97,0.15)]"
                  : "bg-transparent text-[#5b6472]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className={`h-3.5 w-3.5 ${mode === "member" ? "text-[#17805f] opacity-100" : "opacity-75"}`}
              >
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
              </svg>
              Member Login
            </button>
          </div>

          {mode === "staff" ? (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Sign in
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Enter your credentials to access the admin console
              </div>

              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleStaffSubmit} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="login-email"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-[#5b6472]"
                    >
                      <circle cx="12" cy="8" r="3.4" />
                      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
                    </svg>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. kofi.asante@example.com"
                      autoComplete="username"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="login-password"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-[#5b6472]"
                    >
                      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                    </svg>
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Signing in…" : "Sign In"}
                </button>
              </form>
            </>
          ) : memberStep === "id" ? (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Check your membership
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Enter your Controller ID and we'll text a verification code to
                your registered phone
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleRequestOtp} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="controller-id"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Controller ID
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-[#5b6472]"
                    >
                      <rect x="2.5" y="5.5" width="19" height="13" rx="2.2" />
                      <circle cx="8.2" cy="12" r="2" />
                      <path d="M13 10h5M13 14h3" />
                    </svg>
                    <input
                      id="controller-id"
                      value={controllerId}
                      onChange={(e) => setControllerId(e.target.value)}
                      placeholder="e.g. 1188204"
                      inputMode="numeric"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Sending code…" : "Send Verification Code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Enter verification code
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                We've sent a 6-digit code by SMS to the phone on file for
                Controller ID {controllerId}
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleVerifyOtp} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="member-otp"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Verification code
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-[#5b6472]"
                    >
                      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                      <path d="M4 7l8 6 8-6" />
                    </svg>
                    <input
                      id="member-otp"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="e.g. 482913"
                      maxLength={6}
                      inputMode="numeric"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Verifying…" : "Verify & Sign In"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMemberStep("id");
                    setOtp("");
                    setMemberError("");
                  }}
                  className="mt-3 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
                >
                  &larr; Back
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
