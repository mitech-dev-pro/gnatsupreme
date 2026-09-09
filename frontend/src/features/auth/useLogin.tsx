import { useAuth } from "@/lib/AuthContext";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";
import api from "@/lib/api";
import { isMemberPortalPath } from "@/lib/utils";
import { useEffect, useState } from "react";
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
  const [policyGhanaCardId, setPolicyGhanaCardId] = useState("");
  const [spouseName, setSpouseName] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([emptyBeneficiary()]);
  useEffect(() => {
    if ((memberStep !== "setup" && memberStep !== "policy") || districts.length > 0) return;
    api
      .get("/member-auth/districts")
      .then((res) => setDistricts(res.data.data))
      .catch(() => setDistricts([]));
  }, [memberStep, districts.length]);
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
  };
}
