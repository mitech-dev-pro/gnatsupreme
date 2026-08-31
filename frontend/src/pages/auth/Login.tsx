import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";
import api from "@/lib/api";
import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import { isMemberPortalPath, parseISODate, toISODate } from "@/lib/utils";

const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
const GHANA_CARD = /^GHA-\d{9}-\d$/;
const normalizeGhanaCard = (value: string) =>
  value.toUpperCase().replace(/\s/g, "").slice(0, 17);

type BeneficiaryDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  trusteeName: string;
  trusteeGhanaCardId: string;
};

const emptyBeneficiary = (): BeneficiaryDraft => ({
  fullName: "",
  relationship: "CHILD",
  dateOfBirth: "",
  trusteeName: "",
  trusteeGhanaCardId: "",
});

// const FEATURES = [
//   "Scoped access — see only your district, region, or the whole scheme",
//   "Every action is logged to the audit trail",
//   "Changes are saved automatically as you work",
// ];

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
    markProfileComplete,
  } = useMemberAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMode =
    searchParams.get("mode") === "member" ? "member" : "staff";
  const requestedRedirect = searchParams.get("redirect");
  const safeStaffRedirect =
    requestedRedirect &&
    !isMemberPortalPath(requestedRedirect) &&
    requestedRedirect.startsWith("/")
      ? requestedRedirect
      : "/";
  const safeMemberRedirect =
    requestedRedirect && isMemberPortalPath(requestedRedirect)
      ? requestedRedirect
      : "/member";

  const [mode, setMode] = useState<"staff" | "member">(requestedMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [memberStep, setMemberStep] = useState<
    "login" | "setup" | "policy" | "beneficiaries" | "forgot"
  >(
    requestedMode === "member" && searchParams.get("step") === "policy"
      ? "policy"
      : "login",
  );
  const [controllerId, setControllerId] = useState("");
  const [passwordStepVisible, setPasswordStepVisible] = useState(false);
  const [memberPassword, setMemberPassword] = useState("");
  const [showMemberPassword, setShowMemberPassword] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const [setupFullName, setSetupFullName] = useState("");
  const [setupSchool, setSetupSchool] = useState("");
  const [setupDistrictId, setSetupDistrictId] = useState("");
  const [setupDistrictLabel, setSetupDistrictLabel] = useState("");
  const [setupDistrictLocked, setSetupDistrictLocked] = useState(false);
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [districts, setDistricts] = useState<
    { id: number; name: string; region: { name: string } }[]
  >([]);

  const [policyDob, setPolicyDob] = useState("");
  const [policyGhanaCardId, setPolicyGhanaCardId] = useState("");
  const [spouseName, setSpouseName] = useState("");
  const [spouseDob, setSpouseDob] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState("");
  const [marriageCertFile, setMarriageCertFile] = useState<File | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([
    emptyBeneficiary(),
  ]);

  useEffect(() => {
    if (
      (memberStep !== "setup" && memberStep !== "policy") ||
      districts.length > 0
    )
      return;
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

  if (member && requestedMode === "member" && memberStep !== "policy") {
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
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Unable to sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1 of member login: only the Member ID is on screen. This checks whether the
  // membership already has a password set (reusing the existing lookup endpoint, which already
  // distinguishes the two cases via its response) and branches in place — reveals the password
  // field for an already-set-up member, or jumps straight to account setup otherwise. This
  // replaces the old separate "First time signing in?" screen that asked for the Member ID twice.
  const handleContinue = async (e: FormEvent) => {
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
      const res = await api.post("/member-auth/lookup", {
        controllerId: controllerId.trim(),
      });
      setSetupFullName(res.data.data.fullName);
      setSetupSchool(res.data.data.school);
      if (res.data.data.district) {
        setSetupDistrictId(String(res.data.data.district.id));
        setSetupDistrictLabel(`${res.data.data.district.name} — ${res.data.data.district.region.name}`);
        setSetupDistrictLocked(true);
      } else {
        setSetupDistrictLocked(false);
      }
      setMemberStep("setup");
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setPasswordStepVisible(true);
        return;
      }
      setMemberError(
        err?.response?.data?.message || "Unable to look up that Controller ID.",
      );
    } finally {
      setMemberSubmitting(false);
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
        setPasswordStepVisible(false);
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
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message || "Unable to set up your account.",
      );
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

  // Whether spouse details are provided, derived from the (always-visible) full name field rather
  // than a separate include/exclude toggle.
  const hasSpouseDetails = spouseName.trim().length > 0;

  const handlePolicyContinue = (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    if (!policyDob) {
      setMemberError("Enter your date of birth.");
      return;
    }
    if (!GHANA_CARD.test(policyGhanaCardId)) {
      setMemberError("Enter your Ghana Card ID in the format GHA-000000000-0.");
      return;
    }
    if (hasSpouseDetails && spouseName.trim().length < 2) {
      setMemberError("Enter your spouse's full name.");
      return;
    }
    if (
      hasSpouseDetails &&
      spouseGhanaCardId &&
      !GHANA_CARD.test(spouseGhanaCardId)
    ) {
      setMemberError(
        "Enter your spouse's Ghana Card ID in the format GHA-000000000-0.",
      );
      return;
    }

    setMemberStep("beneficiaries");
  };

  const handleFinishSetup = async (e: FormEvent) => {
    e.preventDefault();
    setMemberError("");

    for (const item of beneficiaries) {
      if (!item.fullName.trim()) {
        setMemberError("Enter a full name for every beneficiary.");
        return;
      }
    }

    setMemberSubmitting(true);
    try {
      const res = await api.post("/member-portal/onboarding", {
        dateOfBirth: policyDob,
        ghanaCardId: policyGhanaCardId,
        spouse: hasSpouseDetails
          ? {
              fullName: spouseName.trim(),
              dateOfBirth: spouseDob || null,
              ghanaCardId: spouseGhanaCardId || null,
            }
          : null,
        beneficiaries: beneficiaries.map((item) => ({
          fullName: item.fullName.trim(),
          relationship: item.relationship,
          dateOfBirth: item.dateOfBirth || null,
          trusteeName: item.trusteeName || null,
          trusteeGhanaCardId: item.trusteeGhanaCardId || null,
        })),
      });
      if (hasSpouseDetails && res.data.data.spouseId && marriageCertFile) {
        const formData = new FormData();
        formData.append("file", marriageCertFile);
        await api
          .post("/member-portal/spouse/marriage-certificate", formData)
          .catch(() => undefined);
      }
      markProfileComplete();
      navigate(safeMemberRedirect, { replace: true });
    } catch (err: any) {
      setMemberError(
        err?.response?.data?.message || "Unable to save your details.",
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
    setPolicyDob("");
    setPolicyGhanaCardId("");
    setSpouseName("");
    setSpouseDob("");
    setSpouseGhanaCardId("");
    setMarriageCertFile(null);
    setBeneficiaries([emptyBeneficiary()]);
  };

  return (
    <div className="fixed inset-0 flex justify-center overflow-y-auto bg-[linear-gradient(160deg,#1e2761_0%,#2b3568_55%,#232c5e_100%)] p-5 [align-items:safe_center]">
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
                      // placeholder="e.g. kofi.asante@example.com"
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
                      // placeholder="Enter your password"
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
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                {passwordStepVisible
                  ? "Enter your password to continue."
                  : // : `Enter your ${settings.memberIdLabel} to continue.`}
                    ""}
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form
                onSubmit={
                  passwordStepVisible ? handleMemberLogin : handleContinue
                }
                noValidate
              >
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
                      // placeholder="e.g. 1188204"
                      inputMode="numeric"
                      autoComplete="username"
                      maxLength={7}
                      readOnly={passwordStepVisible}
                      className={
                        passwordStepVisible
                          ? `${inputClasses.replace("pr-3", "pr-16")} cursor-not-allowed bg-[#f3f5f9] text-[#5b6472]`
                          : inputClasses
                      }
                    />
                    {passwordStepVisible && (
                      <button
                        type="button"
                        onClick={editMemberId}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[#1e2761] hover:underline"
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
                      className="text-[11.5px] font-semibold text-[#1e2761] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className={`${passwordStepVisible ? "mt-0.5" : "mt-3.5"} w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60`}
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
              <h2 className="mb-5 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Set up your account
              </h2>
              {/* <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Set your login email and password.
              </div> */}

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleSetupAccount} noValidate>
                <div className="mb-3.5">
                  <label
                    htmlFor="setup-full-name"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Full name
                  </label>
                  <input
                    id="setup-full-name"
                    value={setupFullName}
                    readOnly
                    disabled
                    className={`${inputClasses.replace("pl-9", "pl-3")} cursor-not-allowed bg-[#f3f5f9] text-[#5b6472]`}
                  />
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-school"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    School
                  </label>
                  <input
                    id="setup-school"
                    value={setupSchool}
                    readOnly
                    disabled
                    className={`${inputClasses.replace("pl-9", "pl-3")} cursor-not-allowed bg-[#f3f5f9] text-[#5b6472]`}
                  />
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-district"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    {setupDistrictLocked ? "District" : "District (optional)"}
                  </label>
                  {setupDistrictLocked ? (
                    <input
                      id="setup-district"
                      value={setupDistrictLabel}
                      readOnly
                      disabled
                      className={`${inputClasses.replace("pl-9", "pl-3")} cursor-not-allowed bg-[#f3f5f9] text-[#5b6472]`}
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
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
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
                  <p className="mt-1.5 text-[11px] text-[#5b6472]">
                    Used to reset your password if needed.
                  </p>
                </div>

                <div className="mb-3.5">
                  <label
                    htmlFor="setup-password"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
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
                  <label
                    htmlFor="setup-confirm-password"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
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
                className="mt-4 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
              >
                Already set up? Log in
              </button>
            </>
          ) : memberStep === "policy" ? (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Your policy details
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                A few more details to finish setup.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handlePolicyContinue} noValidate>
                <div className="mb-3.5">
                  <DatePicker
                    label="Date of birth"
                    maxDate={new Date()}
                    value={parseISODate(policyDob)}
                    onChange={(date) => {
                      setPolicyDob(date ? toISODate(date) : "");
                      setMemberError("");
                    }}
                  />
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="policy-ghana-card"
                    className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                  >
                    Ghana Card ID
                  </label>
                  <input
                    id="policy-ghana-card"
                    value={policyGhanaCardId}
                    onChange={(e) => {
                      setPolicyGhanaCardId(normalizeGhanaCard(e.target.value));
                      setMemberError("");
                    }}
                    placeholder="GHA-000000000-0"
                    className={inputClasses.replace("pl-9", "pl-3")}
                  />
                </div>

                <h3 className="mb-2.5 text-[11.5px] font-bold text-[#1e2761]">
                  Spouse details (optional)
                </h3>
                <div className="rounded-[9px] border border-[#e5e9f0] p-3">
                  <div className="mb-3">
                    <label
                      htmlFor="spouse-name"
                      className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
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
                  <div className="mb-3">
                    <DatePicker
                      label="Spouse date of birth (optional)"
                      maxDate={new Date()}
                      value={parseISODate(spouseDob)}
                      onChange={(date) =>
                        setSpouseDob(date ? toISODate(date) : "")
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label
                      htmlFor="spouse-ghana-card"
                      className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                    >
                      Spouse Ghana Card (optional)
                    </label>
                    <input
                      id="spouse-ghana-card"
                      value={spouseGhanaCardId}
                      onChange={(e) => {
                        setSpouseGhanaCardId(
                          normalizeGhanaCard(e.target.value),
                        );
                        setMemberError("");
                      }}
                      placeholder="GHA-000000000-0"
                      className={inputClasses.replace("pl-9", "pl-3")}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="marriage-cert"
                      className="mb-1 block text-[11.5px] font-bold text-[#1e2761]"
                    >
                      Marriage certificate (optional)
                    </label>
                    <input
                      id="marriage-cert"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) =>
                        setMarriageCertFile(e.target.files?.[0] ?? null)
                      }
                      className="w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] py-2 pl-3 pr-3 text-[12px]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-4 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue
                </button>
              </form>
            </>
          ) : memberStep === "beneficiaries" ? (
            <>
              <h2 className="mb-1 text-xl font-extrabold tracking-tight text-[#1e2761]">
                Beneficiaries
              </h2>
              <div className="mb-5 text-[12.5px] leading-relaxed text-[#5b6472]">
                Add anyone who should be listed as a beneficiary.
              </div>

              {memberError && <ErrorBanner message={memberError} />}

              <form onSubmit={handleFinishSetup} noValidate>
                <div className="mb-2 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={beneficiaries.length >= 10}
                    onClick={() =>
                      setBeneficiaries((current) => [
                        ...current,
                        emptyBeneficiary(),
                      ])
                    }
                    className="text-[11.5px] font-semibold text-[#1e2761] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Add beneficiary
                  </button>
                </div>

                {beneficiaries.map((item, index) => (
                  <div
                    key={index}
                    className="mb-3 rounded-[9px] border border-[#e5e9f0] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#1e2761]">
                        Beneficiary {index + 1}
                      </span>
                      {beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBeneficiary(index)}
                          className="text-[11px] font-semibold text-[#c23b3b] hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="mb-2.5">
                      <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">
                        Full name
                      </label>
                      <input
                        value={item.fullName}
                        onChange={(e) =>
                          updateBeneficiary(index, { fullName: e.target.value })
                        }
                        className={inputClasses.replace("pl-9", "pl-3")}
                      />
                    </div>
                    <div className="mb-2.5">
                      <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">
                        Relationship
                      </label>
                      <Dropdown
                        value={item.relationship}
                        onChange={(value) =>
                          updateBeneficiary(index, { relationship: value })
                        }
                        options={RELATIONSHIPS.map((relationship) => ({
                          value: relationship,
                          label:
                            relationship.charAt(0) +
                            relationship.slice(1).toLowerCase(),
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
                    {item.relationship === "CHILD" && (
                      <>
                        <div className="mb-2.5">
                          <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">
                            Trustee name (optional)
                          </label>
                          <input
                            value={item.trusteeName}
                            onChange={(e) =>
                              updateBeneficiary(index, {
                                trusteeName: e.target.value,
                              })
                            }
                            className={inputClasses.replace("pl-9", "pl-3")}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[#1e2761]">
                            Trustee Ghana Card (optional)
                          </label>
                          <input
                            value={item.trusteeGhanaCardId}
                            onChange={(e) =>
                              updateBeneficiary(index, {
                                trusteeGhanaCardId: normalizeGhanaCard(
                                  e.target.value,
                                ),
                              })
                            }
                            placeholder="GHA-000000000-0"
                            className={inputClasses.replace("pl-9", "pl-3")}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="mt-2 w-full rounded-[9px] bg-[#1f9c7c] py-2.5 text-[13px] font-bold text-white shadow-[0_2px_6px_rgba(31,156,124,0.35)] transition hover:bg-[#17805f] disabled:cursor-not-allowed disabled:opacity-60"
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
                className="mt-4 w-full text-center text-[11.5px] font-semibold text-[#5b6472] hover:text-[#1e2761]"
              >
                Back
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
                      // placeholder="e.g. 1188204"
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
