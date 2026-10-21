import { useAuth } from "@/lib/AuthContext";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";
import api from "@/lib/api";
import { GHANA_CARD_ID_PREFIX } from "@/lib/ghanaCardId";
import { isMemberPortalPath } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { emptyBeneficiary, type BeneficiaryDraft } from "./Login.shared";
export function useLogin() {
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
  const requestedMode = searchParams.get("mode") === "staff" ? "staff" : "member";
  const requestedRedirect = searchParams.get("redirect");
  const safeStaffRedirect =
    requestedRedirect && !isMemberPortalPath(requestedRedirect) && requestedRedirect.startsWith("/")
      ? requestedRedirect
      : "/";
  const safeMemberRedirect =
    requestedRedirect && isMemberPortalPath(requestedRedirect) ? requestedRedirect : "/member";
  const [mode, setMode] = useState<"staff" | "member">(requestedMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [memberStep, setMemberStep] = useState<
    "login" | "setup" | "policy" | "beneficiaries" | "forgot"
  >(requestedMode === "member" && searchParams.get("step") === "policy" ? "policy" : "login");
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
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [showSetupConfirmPassword, setShowSetupConfirmPassword] = useState(false);
  const [districts, setDistricts] = useState<
    { id: number; name: string; region: { name: string } }[]
  >([]);
  const [policyGhanaCardId, setPolicyGhanaCardId] = useState(GHANA_CARD_ID_PREFIX);
  const [spouseName, setSpouseName] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState(GHANA_CARD_ID_PREFIX);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([emptyBeneficiary()]);
  // A member enrolled by staff or bulk-uploaded may already have some of these on file --
  // populated from GET /member-portal/profile right after setup succeeds. Non-null here means
  // "already recorded", which the policy step shows read-only and never re-submits, so the
  // 409-on-already-set guard on the backend can never fire for a field the member never touched.
  const [existingGhanaCardId, setExistingGhanaCardId] = useState<string | null>(null);
  const [existingSpouse, setExistingSpouse] = useState<{
    fullName: string;
    ghanaCardId: string | null;
  } | null>(null);
  const [existingBeneficiaryCount, setExistingBeneficiaryCount] = useState(0);
  // Distinguishes "haven't checked yet" from "checked, and genuinely nothing on file" --
  // existingGhanaCardId etc. all start at null/0, which is also what a true first-time member
  // looks like, so a separate flag is needed to know whether loadExistingProfile has actually run.
  const [policyProfileChecked, setPolicyProfileChecked] = useState(false);
  useEffect(() => {
    if ((memberStep !== "setup" && memberStep !== "policy") || districts.length > 0) return;
    api
      .get("/member-auth/districts")
      .then((res) => setDistricts(res.data.data))
      .catch(() => setDistricts([]));
  }, [memberStep, districts.length]);

  // Staff enrollment or bulk upload may have already recorded a Ghana Card ID, spouse, or
  // beneficiaries -- load what's on file so the policy step never re-asks for (and never
  // re-submits) something already set, which the backend would otherwise reject outright.
  // Returns true if the profile turned out to already be complete, in which case this already
  // navigated the member away -- callers must not advance memberStep in that case.
  const loadExistingProfile = useCallback(async () => {
    try {
      const profileRes = await api.get("/member-portal/profile");
      const profile = profileRes.data.data.member;
      const completion = profileRes.data.data.profileCompletion;
      if (completion?.complete) {
        markProfileComplete();
        navigate(safeMemberRedirect, { replace: true });
        return true;
      }
      if (profile.ghanaCardId) {
        setExistingGhanaCardId(profile.ghanaCardId);
        setPolicyGhanaCardId(profile.ghanaCardId);
      }
      if (profile.spouse) {
        setExistingSpouse(profile.spouse);
        setSpouseName(profile.spouse.fullName);
        setSpouseGhanaCardId(profile.spouse.ghanaCardId ?? GHANA_CARD_ID_PREFIX);
      }
      setExistingBeneficiaryCount(profile.beneficiaries?.length ?? 0);
      return false;
    } catch {
      // If the profile fetch fails, fall through to the wizard as usual -- worst case the
      // member re-enters details the way this flow already worked before.
      return false;
    } finally {
      setPolicyProfileChecked(true);
    }
  }, [markProfileComplete, navigate, safeMemberRedirect]);

  // Covers entering the policy step WITHOUT going through handleSetupAccount -- e.g.
  // MemberProtectedRoute redirecting an already-authenticated member with an incomplete profile
  // straight to /login?mode=member&step=policy (so the component mounts directly into "policy"),
  // or a slow-network race where the setup flow's own navigate-away/redirect-back round-trip
  // re-mounts Login into "policy" before handleSetupAccount's own fetch below ever ran. Without
  // this, existingGhanaCardId stays null and the member's own already-on-file card gets
  // resubmitted as if new, tripping the backend's already-on-record guard.
  useEffect(() => {
    if (memberStep !== "policy" || policyProfileChecked || !member || memberLoading) return;
    void loadExistingProfile();
  }, [memberStep, policyProfileChecked, member, memberLoading, loadExistingProfile]);

  return {
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
    existingGhanaCardId,
    setExistingGhanaCardId,
    existingSpouse,
    setExistingSpouse,
    existingBeneficiaryCount,
    setExistingBeneficiaryCount,
    loadExistingProfile,
  };
}
