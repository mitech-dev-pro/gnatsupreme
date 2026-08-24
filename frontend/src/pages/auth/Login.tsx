import { useEffect, useState, type FormEvent } from "react";
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

function EyeToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      onClick={onToggle}
      className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[7px] text-[#5b6472] transition hover:bg-[#eef0fa] hover:text-[#1e2761] focus:outline-none focus-visible:shadow-[0_0_0_3px_#dff7ee]"
    >
      {shown ? (
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
  );
}

export default function Login() {
  const { settings } = useOrganizationSettings();
  const { user, isLoading, login } = useAuth();
  const {
    member,
    isLoading: memberLoading,
    login: memberLogin,
    setupAccount,
    forgotPassword,
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

  const [memberStep, setMemberStep] = useState<"login" | "setup" | "forgot">("login");
  const [controllerId, setControllerId] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [showMemberPassword, setShowMemberPassword] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const [setupFullName, setSetupFullName] = useState("");
  const [setupDistrictId, setSetupDistrictId] = useState("");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [districts, setDistricts] = useState<{ id: number; name: string; region: { name: string } }[]>([]);

  useEffect(() => {
    if (memberStep !== "setup" || districts.length > 0) return;
    api
      .get("/member-auth/districts")
      .then((res) => setDistricts(res.data.data))
      .catch(() => setDistricts([]));
  }, [memberStep, districts.length]);

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

  const handleMemberLogin = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError(
        `Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`,
      );
      return;
    }
    if (!memberPassword) {
      setMemberError("Enter your password.");
      return;
    }

    setMemberSubmitting(true);
    try {
      await memberLogin(controllerId.trim(), memberPassword);
      navigate("/member", { replace: true });
    } catch (err: any) {
      if (err?.response?.data?.code === "SETUP_REQUIRED") {
        setMemberStep("setup");
        setMemberError("");
        return;
      }
      setMemberError(
        err?.response?.data?.message || "Unable to sign in. Please try again.",
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleSetupAccount = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError(`Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`);
      return;
    }
    if (!setupFullName.trim()) {
      setMemberError("Enter your full name as it appears on your membership record.");
      return;
    }
    if (!setupEmail.trim()) {
      setMemberError("Enter your email address.");
      return;
    }
    if (setupPassword.length < 8) {
      setMemberError("Password must be at least 8 characters.");
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setMemberError("Passwords do not match.");
      return;
    }

    setMemberSubmitting(true);
    try {
      await setupAccount({
        controllerId: controllerId.trim(),
        fullName: setupFullName.trim(),
        districtId: setupDistrictId ? Number(setupDistrictId) : undefined,
        email: setupEmail.trim(),
        password: setupPassword,
      });
      navigate("/member", { replace: true });
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message || "Unable to set up your account.",
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");
    setForgotMessage("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError(
        `Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`,
      );
      return;
    }

    setMemberSubmitting(true);
    try {
      const res = await forgotPassword(controllerId.trim());
      setForgotMessage(res.message);
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message || "Unable to process this request.",
      );
    } finally {
      setMemberSubmitting(false);
    }
  };

  const handleMemberModeChange = (nextMode: "staff" | "member") => {
    setMode(nextMode);
    setMemberStep("login");
    setMemberPassword("");
    setMemberError("");
    setForgotMessage("");
    setSetupFullName("");
    setSetupDistrictId("");
    setSetupEmail("");
    setSetupPassword("");
    setSetupConfirmPassword("");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5">
      <div className="grid w-full max-w-120 grid-cols-1 overflow-hidden rounded-[18px] border border-white/10 bg-white shadow-[0_24px_60px_rgba(10,14,40,0.35)] md:grid-cols-1">
        {/* Brand side */}
        {/* <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(165deg,#1e2761_0%,#17805f_130%)] px-9 py-10 text-white md:flex">
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
        </div> */}

        {/* Form side */}
        <div className="flex flex-col px-9 py-10">
          <h1 className="relative z-10 mb-2.5 text-[22px] font-extrabold tracking-tight">
            {settings.portalName}
          </h1>
          <br />
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
                    <EyeToggle
                      shown={showPassword}
                      onToggle={() => setShowPassword((v) => !v)}
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
          ) : memberStep === "login" ? (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Member access
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Enter your {settings.memberIdLabel} and password to access your
                membership.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleMemberLogin} noValidate>
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
                      className={inputClasses}
                    />
                  </div>
                </div>

                <div className="mb-1.5">
                  <label
                    htmlFor="member-password"
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
                      id="member-password"
                      type={showMemberPassword ? "text" : "password"}
                      value={memberPassword}
                      onChange={(e) => {
                        setMemberPassword(e.target.value);
                        setMemberError("");
                      }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${inputClasses} pr-10`}
                    />
                    <EyeToggle
                      shown={showMemberPassword}
                      onToggle={() => setShowMemberPassword((v) => !v)}
                    />
                  </div>
                </div>

                <div className="mb-3.5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setMemberStep("setup");
                      setMemberError("");
                    }}
                    className="text-[11.5px] font-semibold text-[#1e2761] hover:underline"
                  >
                    First time signing in?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMemberStep("forgot");
                      setMemberError("");
                      setForgotMessage("");
                    }}
                    className="text-[11.5px] font-semibold text-[#1e2761] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Signing in…" : "Sign In"}
                </button>
              </form>
              <div className="mt-5 border-t border-[#edf0f5] pt-4 text-[11px] leading-relaxed text-[#5b6472]">
                Can't sign in?
                {(settings.organizationPhone || settings.organizationEmail) && (
                  <p className="mt-2">
                    Contact{" "}
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
                    )}{" "}
                    for help.
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
          ) : memberStep === "setup" ? (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Set up your account
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Confirm your details, then choose a password and email for signing in from now on.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleSetupAccount} noValidate>
                <div className="mb-3.5">
                  <label htmlFor="setup-controller-id" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                    {settings.memberIdLabel}
                  </label>
                  <input
                    id="setup-controller-id"
                    value={controllerId}
                    onChange={(e) => {
                      setControllerId(e.target.value.replace(/\D/g, "").slice(0, 7));
                      setMemberError("");
                    }}
                    placeholder="e.g. 1188204"
                    inputMode="numeric"
                    maxLength={7}
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <div className="mb-3.5">
                  <label htmlFor="setup-full-name" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                    Full name (as on your membership record)
                  </label>
                  <input
                    id="setup-full-name"
                    value={setupFullName}
                    onChange={(e) => {
                      setSetupFullName(e.target.value);
                      setMemberError("");
                    }}
                    placeholder="e.g. Kwasi Tawia"
                    autoComplete="name"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <div className="mb-3.5">
                  <label htmlFor="setup-district" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                    District (optional)
                  </label>
                  <select
                    id="setup-district"
                    value={setupDistrictId}
                    onChange={(e) => {
                      setSetupDistrictId(e.target.value);
                      setMemberError("");
                    }}
                    className={inputClasses.replace("pl-9", "pl-3")}
                  >
                    <option value="">Select your district if known</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {d.region.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] text-[#5b6472]">
                    Not required to continue — only used to fill in your district if it's missing from your record.
                  </p>
                </div>

                <div className="mb-3.5">
                  <label htmlFor="setup-email" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                    Email
                  </label>
                  <input
                    id="setup-email"
                    type="email"
                    value={setupEmail}
                    onChange={(e) => {
                      setSetupEmail(e.target.value);
                      setMemberError("");
                    }}
                    placeholder="e.g. kwasi.tawia@example.com"
                    autoComplete="email"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                  <p className="mt-1.5 text-[11px] text-[#5b6472]">Used only to reset your password if you forget it.</p>
                </div>

                <div className="mb-3.5">
                  <label htmlFor="setup-password" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                    New password
                  </label>
                  <input
                    id="setup-password"
                    type="password"
                    value={setupPassword}
                    onChange={(e) => {
                      setSetupPassword(e.target.value);
                      setMemberError("");
                    }}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <div className="mb-4">
                  <label htmlFor="setup-confirm-password" className="mb-1 block text-[11.5px] font-bold text-[#1e2761]">
                    Confirm new password
                  </label>
                  <input
                    id="setup-confirm-password"
                    type="password"
                    value={setupConfirmPassword}
                    onChange={(e) => {
                      setSetupConfirmPassword(e.target.value);
                      setMemberError("");
                    }}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Setting up…" : "Set Up & Sign In"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMemberStep("login");
                  setMemberError("");
                }}
                className="mt-4 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Reset your password
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Enter your {settings.memberIdLabel} — if there's an email on
                file for your membership, we'll send reset instructions to it.
              </div>

              {memberError && <ErrorBanner message={memberError} />}
              {forgotMessage && (
                <div className="mb-3 rounded-lg bg-[#dff7ee] px-2.5 py-2 text-[12px] font-semibold text-[#17805f]">
                  {forgotMessage}
                </div>
              )}

              {!forgotMessage && (
                <form onSubmit={handleForgotPassword} noValidate>
                  <div className="mb-3.5">
                    <label
                      htmlFor="forgot-controller-id"
                      className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                    >
                      {settings.memberIdLabel}
                    </label>
                    <input
                      id="forgot-controller-id"
                      value={controllerId}
                      onChange={(e) => {
                        setControllerId(
                          e.target.value.replace(/\D/g, "").slice(0, 7),
                        );
                        setMemberError("");
                      }}
                      placeholder="e.g. 1188204"
                      inputMode="numeric"
                      maxLength={7}
                      className={inputClasses.replace("pl-9", "pl-3")}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={memberSubmitting}
                    className="mt-0.5 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {memberSubmitting ? "Sending…" : "Send Reset Instructions"}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setMemberStep("login");
                  setMemberError("");
                  setForgotMessage("");
                }}
                className="mt-4 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
