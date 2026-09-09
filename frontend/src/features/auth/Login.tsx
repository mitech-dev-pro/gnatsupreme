import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import api from "@/lib/api";
import { getApiError, getApiErrorStatus } from "@/lib/errorExtract";
import { applyGhanaCardIdChange } from "@/lib/ghanaCardId";
import { isMinor, parseISODate, toISODate } from "@/lib/utils";
import { type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ErrorBanner } from "./ErrorBanner";
import { EyeToggle } from "./EyeToggle";
import {
  emptyBeneficiary,
  GHANA_CARD,
  inputClasses,
  RELATIONSHIPS,
  type BeneficiaryDraft,
} from "./Login.shared";
import { useLogin } from "./useLogin";
export default function Login() {
  const {
    settings,
    user,
    isLoading,
    login,
    member,
    memberLoading,
    memberLogin,
    setupAccount,
    forgotPassword,
    markProfileComplete,
    navigate,
    requestedMode,
    safeStaffRedirect,
    safeMemberRedirect,
    mode,
    setMode,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    error,
    setError,
    submitting,
    setSubmitting,
    memberStep,
    setMemberStep,
    controllerId,
    setControllerId,
    passwordStepVisible,
    setPasswordStepVisible,
    memberPassword,
    setMemberPassword,
    showMemberPassword,
    setShowMemberPassword,
    memberError,
    setMemberError,
    memberSubmitting,
    setMemberSubmitting,
    forgotMessage,
    setForgotMessage,
    setupFullName,
    setSetupFullName,
    setupSchool,
    setSetupSchool,
    setupDistrictId,
    setSetupDistrictId,
    setupDistrictLabel,
    setSetupDistrictLabel,
    setupDistrictLocked,
    setSetupDistrictLocked,
    setupEmail,
    setSetupEmail,
    setupPassword,
    setSetupPassword,
    showSetupPassword,
    setShowSetupPassword,
    setupConfirmPassword,
    setSetupConfirmPassword,
    showSetupConfirmPassword,
    setShowSetupConfirmPassword,
    districts,
    policyGhanaCardId,
    setPolicyGhanaCardId,
    spouseName,
    setSpouseName,
    spouseGhanaCardId,
    setSpouseGhanaCardId,
    beneficiaries,
    setBeneficiaries,
  } = useLogin();
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
  if (
    member &&
    requestedMode === "member" &&
    memberStep !== "policy" &&
    memberStep !== "beneficiaries"
  ) {
    return <Navigate to={safeMemberRedirect} replace />;
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
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  const handleContinue = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError(`Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`);
      return;
    }

    setMemberSubmitting(true);
    try {
      const res = await api.post("/member-auth/lookup", {
        controllerId: controllerId.trim(),
      });
      setSetupFullName(res.data.data.fullName);
      setSetupSchool(res.data.data.school);
      if (res.data.data.district) {
        setSetupDistrictId(String(res.data.data.district.id));
        setSetupDistrictLabel(
          `${res.data.data.district.name} — ${res.data.data.district.region.name}`,
        );
        setSetupDistrictLocked(true);
      } else {
        setSetupDistrictLocked(false);
      }
      setMemberStep("setup");
    } catch (err: unknown) {
      if (getApiErrorStatus(err) === 409) {
        setPasswordStepVisible(true);
        return;
      }
      setMemberError(getApiError(err)?.message || "Unable to look up that Controller ID.");
    } finally {
      setMemberSubmitting(false);
    }
  };
  const handleMemberLogin = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError(`Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`);
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
    } catch (err: unknown) {
      if (getApiError(err)?.code === "SETUP_REQUIRED") {
        setPasswordStepVisible(false);
        setMemberError("");
        return;
      }
      setMemberError(getApiError(err)?.message || "Unable to sign in. Please try again.");
    } finally {
      setMemberSubmitting(false);
    }
  };
  const editMemberId = () => {
    setPasswordStepVisible(false);
    setMemberPassword("");
    setMemberError("");
  };
  const handleSetupAccount = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

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
      setMemberStep("policy");
    } catch (err: unknown) {
      setMemberError(getApiError(err)?.message || "Unable to set up your account.");
    } finally {
      setMemberSubmitting(false);
    }
  };
  const updateBeneficiary = (index: number, patch: Partial<BeneficiaryDraft>) =>
    setBeneficiaries((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const removeBeneficiary = (index: number) =>
    setBeneficiaries((current) => current.filter((_, i) => i !== index));
  const hasSpouseDetails = spouseName.trim().length > 0;
  const handlePolicyContinue = (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!GHANA_CARD.test(policyGhanaCardId)) {
      setMemberError("Enter your Ghana Card ID in the format GHA-000000000-0.");
      return;
    }
    if (hasSpouseDetails && spouseName.trim().length < 2) {
      setMemberError("Enter your spouse's full name.");
      return;
    }
    if (hasSpouseDetails && spouseGhanaCardId && !GHANA_CARD.test(spouseGhanaCardId)) {
      setMemberError("Enter your spouse's Ghana Card ID in the format GHA-000000000-0.");
      return;
    }

    setMemberStep("beneficiaries");
  };
  const isBeneficiaryStarted = (item: BeneficiaryDraft) =>
    Boolean(item.fullName.trim() || item.dateOfBirth || item.trusteeName.trim());
  const handleFinishSetup = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    const startedBeneficiaries = beneficiaries.filter(isBeneficiaryStarted);
    for (const item of startedBeneficiaries) {
      if (!item.fullName.trim()) {
        setMemberError("Enter a full name for every beneficiary.");
        return;
      }
      if (isMinor(item.dateOfBirth) && !item.trusteeName.trim()) {
        setMemberError("Enter a trustee name for every beneficiary under 18.");
        return;
      }
    }

    setMemberSubmitting(true);
    try {
      await api.post("/member-portal/onboarding", {
        ghanaCardId: policyGhanaCardId,
        spouse: hasSpouseDetails
          ? {
              fullName: spouseName.trim(),
              ghanaCardId: spouseGhanaCardId || null,
            }
          : null,
        beneficiaries: startedBeneficiaries.map((item) => ({
          fullName: item.fullName.trim(),
          relationship: item.relationship,
          dateOfBirth: item.dateOfBirth || null,
          trusteeName: item.trusteeName || null,
        })),
      });
      markProfileComplete();
      navigate(safeMemberRedirect, { replace: true });
    } catch (err: unknown) {
      setMemberError(getApiError(err)?.message || "Unable to save your details.");
    } finally {
      setMemberSubmitting(false);
    }
  };
  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");
    setForgotMessage("");

    if (!/^\d{4,7}$/.test(controllerId.trim())) {
      setMemberError(`Enter a valid ${settings.memberIdLabel} (4 to 7 digits).`);
      return;
    }

    setMemberSubmitting(true);
    try {
      const res = await forgotPassword(controllerId.trim());
      setForgotMessage(res.message);
    } catch (err: unknown) {
      setMemberError(getApiError(err)?.message || "Unable to process this request.");
    } finally {
      setMemberSubmitting(false);
    }
  };
  const handleMemberModeChange = (nextMode: "staff" | "member") => {
    setMode(nextMode);
    setMemberStep("login");
    setPasswordStepVisible(false);
    setMemberPassword("");
    setMemberError("");
    setForgotMessage("");
    setSetupFullName("");
    setSetupSchool("");
    setSetupDistrictId("");
    setSetupDistrictLabel("");
    setSetupDistrictLocked(false);
    setSetupEmail("");
    setSetupPassword("");
    setSetupConfirmPassword("");
    setPolicyGhanaCardId("");
    setSpouseName("");
    setSpouseGhanaCardId("");
    setBeneficiaries([emptyBeneficiary()]);
  };
  return (
    <div className="fixed inset-0 flex justify-center overflow-y-auto bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5 items-center-safe">
      <div className="grid w-full max-w-140 grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-white shadow-dialog md:grid-cols-1">
        {/* Brand side */}
        {/* <div className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(165deg,#1e2761_0%,#17805f_130%)] px-9 py-10 text-white md:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-15 -top-15 h-55 w-55 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_70%)]"
          />
          <div>
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-16 w-29 items-center justify-center rounded-xl bg-white px-2.5 py-1.5 shadow-nav-raised">
                <img
                  src="/brand/gnat-logo.png?v=1"
                  alt="GNAT"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="h-10 w-px shrink-0 bg-white/20" />
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
                  Underwritten by
                </div>
                <div className="flex h-12 w-27 items-center justify-center rounded-xl bg-white px-2.5 py-1.5 shadow-nav-hover">
                  <img
                    src="/brand/milife-logo.png?v=1"
                    alt="miLife Insurance"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>

            <div className="my-5 flex h-1.25 w-21 overflow-hidden rounded-sm">
              <span className="flex-1 bg-success-soft" />
              <span className="flex-1 bg-action-primary" />
              <span className="flex-1 bg-warning-accent" />
              <span className="flex-1 bg-white" />
            </div>

            <h1 className="relative z-10 mb-2.5 text-2xl font-extrabold tracking-tight">
              {settings.portalName}
            </h1>
            <p className="relative z-10 text-sm leading-relaxed text-white/80">
              Member Portal for {settings.schemeSponsor}'s health scheme,
              underwritten with {settings.underwriter}. Sign in with your
              district, regional, or national administrator account.
            </p>

            {FEATURES.map((f) => (
              <div
                key={f}
                className="relative z-10 mt-4 flex items-start gap-2.5 text-sm text-white/90"
              >
                <div className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/12">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    className="h-3.25 w-3.25 text-success-soft"
                  >
                    <path d="M9 12.5 11 14.5 15.5 9" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </div>
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-6 text-xs text-white/55">
            Sign in with the staff account issued to you by{" "}
            {settings.portalName}.
          </div>
        </div> */}

        {/* Form side */}
        <div className="flex flex-col px-9 py-10">
          <div className="flex items-center justify-center flex-col text-center">
            <h1 className="text-4xl font-extrabold tracking-tight mb-1">GNAT Supreme Care</h1>
            <p className="text-base font-medium text-muted-foreground">
              Group Insurance Scheme Portal
            </p>
          </div>
          <br />
          <div className="mb-5.5 flex gap-1 rounded-xl bg-info-soft p-1">
            <button
              type="button"
              onClick={() => handleMemberModeChange("member")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
                mode === "member"
                  ? "bg-white text-text-strong shadow-subtle"
                  : "bg-transparent text-text-muted"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className={`h-3.5 w-3.5 ${mode === "member" ? "text-success opacity-100" : "opacity-75"}`}
              >
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
              </svg>
              Member Access
            </button>
            <button
              type="button"
              onClick={() => handleMemberModeChange("staff")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-bold transition ${
                mode === "staff"
                  ? "bg-white text-text-strong shadow-subtle"
                  : "bg-transparent text-text-muted"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                className={`h-3.5 w-3.5 ${mode === "staff" ? "text-success opacity-100" : "opacity-75"}`}
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 4v5" />
              </svg>
              Administrators
            </button>
          </div>

          {mode === "staff" ? (
            <>
              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleStaffSubmit} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="login-email"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-text-muted"
                    >
                      <circle cx="12" cy="8" r="3.4" />
                      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
                    </svg>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      // placeholder="e.g. kofi.asante@example.com"
                      autoComplete="username"
                      className={inputClasses}
                    />
                  </div>
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="login-password"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-text-muted"
                    >
                      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                    </svg>
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      // placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${inputClasses} pr-10`}
                    />
                    <EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-0.5 w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Signing in…" : "Sign In"}
                </button>
              </form>
            </>
          ) : memberStep === "login" ? (
            <>
              <div className="mb-5 text-sm leading-relaxed text-text-muted">
                {passwordStepVisible
                  ? "Enter your password to continue."
                  : // : `Enter your ${settings.memberIdLabel} to continue.`}
                    ""}
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={passwordStepVisible ? handleMemberLogin : handleContinue} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="controller-id"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    {settings.memberIdLabel}
                  </label>
                  <div className="relative">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-text-muted"
                    >
                      <rect x="2.5" y="5.5" width="19" height="13" rx="2.2" />
                      <circle cx="8.2" cy="12" r="2" />
                      <path d="M13 10h5M13 14h3" />
                    </svg>
                    <input
                      id="controller-id"
                      value={controllerId}
                      onChange={(e) => {
                        setControllerId(e.target.value.replace(/\D/g, "").slice(0, 7));
                        setMemberError("");
                      }}
                      // placeholder="e.g. 1188204"
                      inputMode="numeric"
                      autoComplete="username"
                      maxLength={7}
                      readOnly={passwordStepVisible}
                      className={
                        passwordStepVisible
                          ? `${inputClasses.replace("pr-3", "pr-16")} cursor-not-allowed bg-surface-inset text-text-muted`
                          : inputClasses
                      }
                    />
                    {passwordStepVisible && (
                      <button
                        type="button"
                        onClick={editMemberId}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-text-strong hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {passwordStepVisible && (
                  <div className="mb-1.5">
                    <label
                      htmlFor="member-password"
                      className="mb-1 block text-xs font-bold text-text-strong"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="pointer-events-none absolute left-3 top-1/2 h-3.75 w-3.75 -translate-y-1/2 text-text-muted"
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
                        // placeholder="Enter your password"
                        autoComplete="current-password"
                        autoFocus
                        className={`${inputClasses} pr-10`}
                      />
                      <EyeToggle
                        shown={showMemberPassword}
                        onToggle={() => setShowMemberPassword((v) => !v)}
                      />
                    </div>
                  </div>
                )}

                {passwordStepVisible && (
                  <div className="mb-3.5 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMemberStep("forgot");
                        setMemberError("");
                        setForgotMessage("");
                      }}
                      className="text-xs font-semibold text-text-strong hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className={`${passwordStepVisible ? "mt-0.5" : "mt-3.5"} w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {passwordStepVisible
                    ? memberSubmitting
                      ? "Signing in…"
                      : "Sign In"
                    : memberSubmitting
                      ? "Checking…"
                      : "Continue"}
                </button>
              </form>
              <div className="mt-5 border-t border-surface-disabled pt-4 text-xs leading-relaxed text-text-muted">
                Can't sign in?
                {(settings.organizationPhone || settings.organizationEmail) && (
                  <p className="mt-2">
                    Contact{" "}
                    {settings.organizationPhone && (
                      <a
                        className="font-semibold text-text-strong"
                        href={`tel:${settings.organizationPhone}`}
                      >
                        {settings.organizationPhone}
                      </a>
                    )}
                    {settings.organizationPhone && settings.organizationEmail ? " · " : ""}
                    {settings.organizationEmail && (
                      <a
                        className="font-semibold text-text-strong"
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
                    <summary className="cursor-pointer font-semibold text-text-strong">
                      Privacy notice
                    </summary>
                    <p className="mt-1 max-h-24 overflow-y-auto pr-2">{settings.privacyNotice}</p>
                  </details>
                )}
              </div>
            </>
          ) : memberStep === "setup" ? (
            <>
              <h2 className="mb-1 text-lg font-extrabold tracking-tight text-text-strong">
                Set up your account
              </h2>
              {/* <div className="mb-5 text-sm leading-relaxed text-text-muted">
                Set your login email and password.
              </div> */}
              <div className="mb-5 rounded-lg bg-[#eef2fb] px-2.5 py-2 text-xs leading-relaxed font-semibold text-[#334a7a]">
                The details below were recorded by your district office at enrollment. If any of
                this information is incorrect, please contact your district office to have it
                corrected.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleSetupAccount} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="setup-full-name"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    Full name
                  </label>
                  <input
                    id="setup-full-name"
                    value={setupFullName}
                    readOnly
                    disabled
                    className={`${inputClasses.replace("pl-9", "pl-3")} cursor-not-allowed bg-surface-inset text-text-muted`}
                  />
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-school"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    School
                  </label>
                  <input
                    id="setup-school"
                    value={setupSchool}
                    readOnly
                    disabled
                    className={`${inputClasses.replace("pl-9", "pl-3")} cursor-not-allowed bg-surface-inset text-text-muted`}
                  />
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-district"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    {setupDistrictLocked ? "District" : "District (optional)"}
                  </label>
                  {setupDistrictLocked ? (
                    <input
                      id="setup-district"
                      value={setupDistrictLabel}
                      readOnly
                      disabled
                      className={`${inputClasses.replace("pl-9", "pl-3")} cursor-not-allowed bg-surface-inset text-text-muted`}
                    />
                  ) : (
                    <Dropdown
                      id="setup-district"
                      value={setupDistrictId}
                      onChange={(value) => {
                        setSetupDistrictId(value);
                        setMemberError("");
                      }}
                      // placeholder="Select your district if known"
                      options={districts.map((d) => ({
                        value: String(d.id),
                        label: `${d.name} — ${d.region.name}`,
                      }))}
                    />
                  )}
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-email"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
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
                    // placeholder="e.g. kwasi.tawia@example.com"
                    autoComplete="email"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                  <p className="mt-1.5 text-xs text-text-muted">
                    Used to reset your password if needed.
                  </p>
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-password"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="setup-password"
                      type={showSetupPassword ? "text" : "password"}
                      value={setupPassword}
                      onChange={(e) => {
                        setSetupPassword(e.target.value);
                        setMemberError("");
                      }}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className={`${inputClasses.replace("pl-9", "pl-3")} pr-10`}
                    />
                    <EyeToggle
                      shown={showSetupPassword}
                      onToggle={() => setShowSetupPassword((v) => !v)}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="setup-confirm-password"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    Confirm new password
                  </label>
                  <div className="relative">
                    <input
                      id="setup-confirm-password"
                      type={showSetupConfirmPassword ? "text" : "password"}
                      value={setupConfirmPassword}
                      onChange={(e) => {
                        setSetupConfirmPassword(e.target.value);
                        setMemberError("");
                      }}
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
                      className={`${inputClasses.replace("pl-9", "pl-3")} pr-10`}
                    />
                    <EyeToggle
                      shown={showSetupConfirmPassword}
                      onToggle={() => setShowSetupConfirmPassword((v) => !v)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-0.5 w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Continuing…" : "Continue"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMemberStep("login");
                  setPasswordStepVisible(false);
                  setMemberError("");
                }}
                className="mt-4 w-full text-center text-xs font-semibold text-text-muted hover:text-text-strong"
              >
                Already set up? Log in
              </button>
            </>
          ) : memberStep === "policy" ? (
            <>
              <h2 className="mb-1 text-lg font-extrabold tracking-tight text-text-strong">
                Please provide your policy details
              </h2>
              <div className="mb-5 text-sm leading-relaxed text-text-muted">
                A few more details to finish setup.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handlePolicyContinue} noValidate>
                <div className="mb-4">
                  <label
                    htmlFor="policy-ghana-card"
                    className="mb-1 block text-xs font-bold text-text-strong"
                  >
                    Ghana Card ID
                  </label>
                  <input
                    id="policy-ghana-card"
                    value={policyGhanaCardId}
                    onChange={(e) => {
                      setPolicyGhanaCardId(applyGhanaCardIdChange(e));
                      setMemberError("");
                    }}
                    placeholder="GHA-000000000-0"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <h3 className="mb-2.5 text-base font-bold text-text-strong">
                  Spouse details (optional)
                </h3>
                <div className="rounded-lg border border-border-default p-3">
                  <div className="mb-3">
                    <label
                      htmlFor="spouse-name"
                      className="mb-1 block text-xs font-bold text-text-strong"
                    >
                      Spouse full name
                    </label>
                    <input
                      id="spouse-name"
                      value={spouseName}
                      onChange={(e) => {
                        setSpouseName(e.target.value);
                        setMemberError("");
                      }}
                      className={inputClasses.replace("pl-9", "pl-3")}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="spouse-ghana-card"
                      className="mb-1 block text-xs font-bold text-text-strong"
                    >
                      Spouse Ghana Card (optional)
                    </label>
                    <input
                      id="spouse-ghana-card"
                      value={spouseGhanaCardId}
                      onChange={(e) => {
                        setSpouseGhanaCardId(applyGhanaCardIdChange(e));
                        setMemberError("");
                      }}
                      placeholder="GHA-000000000-0"
                      className={inputClasses.replace("pl-9", "pl-3")}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-4 w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue
                </button>
              </form>
            </>
          ) : memberStep === "beneficiaries" ? (
            <>
              <h2 className="mb-1 text-lg font-extrabold tracking-tight text-text-strong">
                Beneficiaries
              </h2>
              <div className="mb-5 text-sm leading-relaxed text-text-muted">
                Add anyone who should be listed as a beneficiary.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleFinishSetup} noValidate>
                {beneficiaries.map((item, index) => (
                  <div key={index} className="mb-3 rounded-lg border border-border-default p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-text-strong">
                        Beneficiary {index + 1}
                      </span>
                      {beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBeneficiary(index)}
                          className="text-xs font-semibold text-danger hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="mb-2.5">
                      <label className="mb-1 block text-xs font-bold text-text-strong">
                        Full name
                      </label>
                      <input
                        value={item.fullName}
                        onChange={(e) => updateBeneficiary(index, { fullName: e.target.value })}
                        className={inputClasses.replace("pl-9", "pl-3")}
                      />
                    </div>
                    <div className="mb-2.5">
                      <label className="mb-1 block text-xs font-bold text-text-strong">
                        Relationship
                      </label>
                      <Dropdown
                        value={item.relationship}
                        onChange={(value) => updateBeneficiary(index, { relationship: value })}
                        options={RELATIONSHIPS.map((relationship) => ({
                          value: relationship,
                          label: relationship.charAt(0) + relationship.slice(1).toLowerCase(),
                        }))}
                      />
                    </div>
                    <div className="mb-2.5">
                      <DatePicker
                        label="Date of birth (optional)"
                        maxDate={new Date()}
                        value={parseISODate(item.dateOfBirth)}
                        onChange={(date) =>
                          updateBeneficiary(index, {
                            dateOfBirth: date ? toISODate(date) : "",
                          })
                        }
                      />
                    </div>
                    {isMinor(item.dateOfBirth) && (
                      <>
                        <p className="mb-2.5 rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning-accent">
                          This beneficiary is under 18 — a trustee name is required.
                        </p>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-text-strong">
                            Trustee name
                          </label>
                          <input
                            value={item.trusteeName}
                            onChange={(e) =>
                              updateBeneficiary(index, {
                                trusteeName: e.target.value,
                              })
                            }
                            required
                            className={inputClasses.replace("pl-9", "pl-3")}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <div className="mb-3 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={beneficiaries.length >= 10}
                    onClick={() => setBeneficiaries((current) => [...current, emptyBeneficiary()])}
                    className="text-xs font-semibold text-text-strong hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Add another beneficiary
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-2 w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {memberSubmitting ? "Saving…" : "Finish Setup"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMemberStep("policy");
                  setMemberError("");
                }}
                className="mt-4 w-full text-center text-xs font-semibold text-text-muted hover:text-text-strong"
              >
                Back
              </button>
            </>
          ) : (
            <>
              <h2 className="mb-1 text-lg font-extrabold tracking-tight text-text-strong">
                Reset your password
              </h2>
              <div className="mb-5 text-sm leading-relaxed text-text-muted">
                Enter your {settings.memberIdLabel} — if there's an email on file for your
                membership, we'll send reset instructions to it.
              </div>

              {memberError && <ErrorBanner message={memberError} />}
              {forgotMessage && (
                <div className="mb-3 rounded-lg bg-success-soft px-2.5 py-2 text-xs font-semibold text-success">
                  {forgotMessage}
                </div>
              )}

              {!forgotMessage && (
                <form onSubmit={handleForgotPassword} noValidate>
                  <div className="mb-3.5">
                    <label
                      htmlFor="forgot-controller-id"
                      className="mb-1 block text-xs font-bold text-text-strong"
                    >
                      {settings.memberIdLabel}
                    </label>
                    <input
                      id="forgot-controller-id"
                      value={controllerId}
                      onChange={(e) => {
                        setControllerId(e.target.value.replace(/\D/g, "").slice(0, 7));
                        setMemberError("");
                      }}
                      // placeholder="e.g. 1188204"
                      inputMode="numeric"
                      maxLength={7}
                      className={inputClasses.replace("pl-9", "pl-3")}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={memberSubmitting}
                    className="mt-0.5 w-full rounded-lg bg-action-primary py-2.5 text-sm font-bold text-white shadow-action transition hover:bg-success disabled:cursor-not-allowed disabled:opacity-60"
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
                className="mt-4 w-full text-center text-xs font-semibold text-text-muted hover:text-text-strong"
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
