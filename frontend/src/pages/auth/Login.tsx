import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";
import api from "@/lib/api";

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
  const { settings } = useOrganizationSettings();
  const { user, isLoading, login } = useAuth();
  const {
    member,
    isLoading: memberLoading,
    requestOtp,
    registerPhone,
    verifyOtp,
  } = useMemberAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMode =
    searchParams.get("mode") === "member" ? "member" : "staff";
  const requestedRedirect = searchParams.get("redirect");
  const safeStaffRedirect =
    requestedRedirect &&
    !requestedRedirect.startsWith("/member") &&
    requestedRedirect.startsWith("/")
      ? requestedRedirect
      : "/";

  const [mode, setMode] = useState<"staff" | "member">(requestedMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [memberStep, setMemberStep] = useState<"id" | "register" | "otp">("id");
  const [controllerId, setControllerId] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [memberError, setMemberError] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [requestRetrySeconds, setRequestRetrySeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const otpFormRef = useRef<HTMLFormElement>(null);

  const [regFullName, setRegFullName] = useState("");
  const [regDistrictId, setRegDistrictId] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [districts, setDistricts] = useState<
    { id: number; name: string; region: { name: string } }[]
  >([]);
  const [districtsLoading, setDistrictsLoading] = useState(false);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(
      () => setResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (requestRetrySeconds <= 0) return;
    const timer = window.setInterval(
      () => setRequestRetrySeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [requestRetrySeconds]);

  useEffect(() => {
    if (otp.length === 6 && memberStep === "otp" && !memberSubmitting) otpFormRef.current?.requestSubmit();
  }, [otp, memberStep, memberSubmitting]);

  useEffect(() => {
    if (memberStep !== "register" || districts.length > 0 || districtsLoading)
      return;
    setDistrictsLoading(true);
    api
      .get("/member-auth/districts")
      .then((res) => setDistricts(res.data.data))
      .catch(() => setDistricts([]))
      .finally(() => setDistrictsLoading(false));
  }, [memberStep, districts.length, districtsLoading]);

  if (isLoading || memberLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (user && requestedMode === "staff") {
    return <Navigate to={safeStaffRedirect} replace />;
  }

  if (member && requestedMode === "member") {
    return (
      <Navigate
        to={
          requestedRedirect?.startsWith("/member")
            ? requestedRedirect
            : "/member"
        }
        replace
      />
    );
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
      navigate(safeStaffRedirect, { replace: true });
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
      setMemberError(
        `Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`,
      );
      return;
    }

    setMemberSubmitting(true);
    try {
      const res = await requestOtp(controllerId.trim());
      setChallengeToken(res.challengeToken);
      setMemberStep("otp");
      setResendSeconds(60);
      setResendMessage("");
    } catch (err: any) {
      const retryAfter = Number(
        err?.response?.data?.retryAfterSeconds ?? err?.response?.headers?.["retry-after"],
      );
      if (err?.response?.status === 429 && Number.isFinite(retryAfter)) {
        setRequestRetrySeconds(Math.max(1, Math.ceil(retryAfter)));
      }
      if (err?.response?.data?.code === "PHONE_NOT_ON_FILE") {
        setMemberStep("register");
        setMemberError("");
        return;
      }
      setMemberError(
        err?.response?.data?.message || "Unable to send a verification code.",
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleRegisterPhone = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!regFullName.trim()) {
      setMemberError(
        "Enter your full name as it appears on your membership record.",
      );
      return;
    }
    if (!regDistrictId) {
      setMemberError("Select your district.");
      return;
    }
    if (!/^0\d{9}$/.test(regPhone.trim())) {
      setMemberError("Enter a valid 10-digit phone number starting with 0.");
      return;
    }

    setMemberSubmitting(true);
    try {
      const res = await registerPhone({
        controllerId: controllerId.trim(),
        fullName: regFullName.trim(),
        districtId: Number(regDistrictId),
        phone: regPhone.trim(),
      });
      setChallengeToken(res.challengeToken);
      setMemberStep("otp");
      setResendSeconds(60);
      setResendMessage("");
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message || "Unable to register your phone number.",
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

  const handleResendOtp = async () => {
    if (resendSeconds > 0 || memberSubmitting) return;
    setMemberSubmitting(true);
    setMemberError("");
    setResendMessage("");
    try {
      const response = await requestOtp(controllerId.trim());
      setChallengeToken(response.challengeToken);
      setOtp("");
      setResendSeconds(60);
      setResendMessage("A new verification code has been sent.");
    } catch (err: any) {
      const retryAfter = Number(
        err?.response?.data?.retryAfterSeconds ?? err?.response?.headers?.["retry-after"],
      );
      if (err?.response?.status === 429 && Number.isFinite(retryAfter)) {
        setResendSeconds(Math.max(1, Math.ceil(retryAfter)));
      }
      setMemberError(err?.response?.data?.message || "Unable to resend the verification code.");
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
    setResendMessage("");
    setResendSeconds(0);
    setRequestRetrySeconds(0);
    setRegFullName("");
    setRegDistrictId("");
    setRegPhone("");
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
              {settings.portalName}
            </h1>
            <p className="relative z-10 text-[13px] leading-relaxed text-white/80">
              Member Portal for {settings.schemeSponsor}'s health scheme,
              underwritten with {settings.underwriter}. Sign in with your
              district, regional, or national administrator account.
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
            Sign in with the staff account issued to you by{" "}
            {settings.portalName}.
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
              Member Access
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
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${inputClasses} pr-10`}
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[7px] text-[#5b6472] transition hover:bg-[#eef0fa] hover:text-[#1e2761] focus:outline-none focus-visible:shadow-[0_0_0_3px_#dff7ee]"
                    >
                      {showPassword ? (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="size-4"
                        >
                          <path d="m3 3 18 18" />
                          <path
                            d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.8 10.8 0 0 1 12 4c6 0 9.5 8 9.5 8a17 17 0 0 1-2.1 3.3M6.6 6.6C4 8.4 2.5 12 2.5 12S6 20 12 20c1.3 0 2.5-.4 3.6-1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="size-4"
                        >
                          <path
                            d="M2.5 12S6 4 12 4s9.5 8 9.5 8S18 20 12 20 2.5 12 2.5 12Z"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="12" r="2.5" />
                        </svg>
                      )}
                    </button>
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
              <div
                className="mb-5 flex items-center gap-2 text-[10.5px] font-bold"
                aria-label="Step 1 of 2, verify membership"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-[#1f9c7c] text-white">
                  1
                </span>
                <span className="text-[#1e2761]">Verify membership</span>
                <span className="h-px flex-1 bg-[#dfe4ec]" />
                <span className="flex size-6 items-center justify-center rounded-full bg-[#eef0fa] text-[#5b6472]">
                  2
                </span>
                <span className="text-[#7b8492]">Enter SMS code</span>
              </div>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Member access
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Enter your {settings.memberIdLabel} and we'll text a
                verification code to your registered phone
              </div>

              <form onSubmit={handleRequestOtp} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="controller-id"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    {settings.memberIdLabel}
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
                      onChange={(e) => {
                        setControllerId(
                          e.target.value.replace(/\D/g, "").slice(0, 7),
                        );
                        setMemberError("");
                      }}
                      placeholder="e.g. 1188204"
                      inputMode="numeric"
                      autoComplete="username"
                      maxLength={7}
                      aria-invalid={Boolean(memberError)}
                      aria-describedby={
                        memberError ? "member-id-error" : "member-id-help"
                      }
                      className={inputClasses}
                    />
                  </div>
                  {memberError ? (
                    <p
                      id="member-id-error"
                      role="alert"
                      className="mt-1.5 text-[11.5px] font-semibold text-[#c23b3b]"
                    >
                      {memberError}
                    </p>
                  ) : (
                    <p
                      id="member-id-help"
                      className="mt-1.5 text-[11px] text-[#5b6472]"
                    >
                      Use the ID shown on your membership record or payslip.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting || requestRetrySeconds > 0}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting
                    ? "Sending code…"
                    : requestRetrySeconds > 0
                      ? `Try again in ${Math.ceil(requestRetrySeconds / 60)} min`
                      : "Send Verification Code"}
                </button>
                {requestRetrySeconds > 0 && (
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-[#5b6472]" aria-live="polite">
                    Requests are temporarily paused for this membership on this network. The button will become available automatically.
                  </p>
                )}
              </form>
              <div className="mt-5 border-t border-[#edf0f5] pt-4 text-[11px] leading-relaxed text-[#5b6472]">
                We use the SMS code only to verify access to your membership
                record.
                {(settings.organizationPhone || settings.organizationEmail) && (
                  <p className="mt-2">
                    Need help?{" "}
                    {settings.organizationPhone && (
                      <a
                        className="font-semibold text-[#1e2761]"
                        href={`tel:${settings.organizationPhone}`}
                      >
                        {settings.organizationPhone}
                      </a>
                    )}
                    {settings.organizationPhone && settings.organizationEmail
                      ? " · "
                      : ""}
                    {settings.organizationEmail && (
                      <a
                        className="font-semibold text-[#1e2761]"
                        href={`mailto:${settings.organizationEmail}`}
                      >
                        {settings.organizationEmail}
                      </a>
                    )}
                  </p>
                )}
                {settings.privacyNotice && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold text-[#1e2761]">
                      Privacy notice
                    </summary>
                    <p className="mt-1 max-h-24 overflow-y-auto pr-2">
                      {settings.privacyNotice}
                    </p>
                  </details>
                )}
              </div>
            </>
          ) : memberStep === "register" ? (
            <>
              <div
                className="mb-5 flex items-center gap-2 text-[10.5px] font-bold"
                aria-label="Step 1 of 2, register your phone number"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-[#1f9c7c] text-white">
                  1
                </span>
                <span className="text-[#1e2761]">Register your phone</span>
                <span className="h-px flex-1 bg-[#dfe4ec]" />
                <span className="flex size-6 items-center justify-center rounded-full bg-[#eef0fa] text-[#5b6472]">
                  2
                </span>
                <span className="text-[#7b8492]">Enter SMS code</span>
              </div>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                No phone on file yet
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                We couldn't find a phone number for {settings.memberIdLabel}{" "}
                {controllerId}. Confirm your details below to register one and
                continue signing in.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleRegisterPhone} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="reg-full-name"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Full name (as on your membership record)
                  </label>
                  <input
                    id="reg-full-name"
                    value={regFullName}
                    onChange={(e) => {
                      setRegFullName(e.target.value);
                      setMemberError("");
                    }}
                    placeholder="e.g. Kwasi Tawia"
                    autoComplete="name"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="reg-district"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    District
                  </label>
                  <select
                    id="reg-district"
                    value={regDistrictId}
                    onChange={(e) => {
                      setRegDistrictId(e.target.value);
                      setMemberError("");
                    }}
                    className={inputClasses.replace("pl-9", "pl-3")}
                  >
                    <option value="">
                      {districtsLoading
                        ? "Loading districts…"
                        : "Select your district"}
                    </option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.region.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="reg-phone"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Phone number
                  </label>
                  <input
                    id="reg-phone"
                    value={regPhone}
                    onChange={(e) => {
                      setRegPhone(
                        e.target.value.replace(/\D/g, "").slice(0, 10),
                      );
                      setMemberError("");
                    }}
                    placeholder="e.g. 0241234567"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                  <p className="mt-1.5 text-[11px] text-[#5b6472]">
                    We'll text a verification code to this number.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Registering…" : "Register & Send Code"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMemberStep("id");
                    setMemberError("");
                  }}
                  className="mt-3 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
                >
                  Use a different {settings.memberIdLabel}
                </button>
              </form>
            </>
          ) : (
            <>
              <div
                className="mb-5 flex items-center gap-2 text-[10.5px] font-bold"
                aria-label="Step 2 of 2, enter SMS code"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-[#dff7ee] text-[#17805f]">
                  ✓
                </span>
                <span className="text-[#5b6472]">Membership found</span>
                <span className="h-px flex-1 bg-[#1f9c7c]" />
                <span className="flex size-6 items-center justify-center rounded-full bg-[#1f9c7c] text-white">
                  2
                </span>
                <span className="text-[#1e2761]">Enter SMS code</span>
              </div>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Enter verification code
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                We've sent a 6-digit code by SMS to the phone on file for
                {settings.memberIdLabel} {controllerId}
              </div>

              <form ref={otpFormRef} onSubmit={handleVerifyOtp} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="member-otp"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Verification code
                  </label>
                  <div className="relative">
                    <input
                      id="member-otp"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setMemberError("");
                      }}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      enterKeyHint="done"
                      aria-invalid={Boolean(memberError)}
                      aria-describedby={
                        memberError ? "member-otp-error" : "member-otp-help"
                      }
                      className={`${inputClasses} py-3 text-center font-mono text-[20px] font-bold tracking-[0.45em] text-[#1e2761]`}
                    />
                  </div>
                  {memberError ? (
                    <p
                      id="member-otp-error"
                      role="alert"
                      className="mt-1.5 text-[11.5px] font-semibold text-[#c23b3b]"
                    >
                      {memberError}
                    </p>
                  ) : (
                    <p
                      id="member-otp-help"
                      className="mt-1.5 text-[11px] text-[#5b6472]"
                    >
                      Enter or paste the complete six-digit code.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting || otp.length !== 6}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Verifying…" : "Verify & Sign In"}
                </button>

                <div
                  className="mt-3 text-center text-[11.5px] text-[#5b6472]"
                  aria-live="polite"
                >
                  {resendMessage ||
                    (resendSeconds > 0
                      ? `You can request another code in ${resendSeconds}s`
                      : "Didn't receive the code?")}
                </div>
                <button
                  type="button"
                  onClick={() => void handleResendOtp()}
                  disabled={memberSubmitting || resendSeconds > 0}
                  className="mt-1.5 w-full text-center text-[11.5px] font-semibold text-[#1e2761] disabled:cursor-not-allowed disabled:text-[#9aa3b2]"
                >
                  Resend code
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMemberStep("id");
                    setOtp("");
                    setMemberError("");
                    setResendMessage("");
                    setResendSeconds(0);
                  }}
                  className="mt-3 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
                >
                  Use a different {settings.memberIdLabel}
                </button>
              </form>
              {(settings.organizationPhone || settings.organizationEmail) && (
                <p className="mt-4 text-center text-[11px] text-[#5b6472]">
                  Phone number outdated? Contact{" "}
                  {settings.organizationPhone || settings.organizationEmail}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
