import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useDistricts } from "@/lib/useDistricts";
import { isMinor } from "@/lib/utils";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ELEVATED_ROLES, type MemberDetailData, type WorkflowEvent } from "./MemberDetail.model";
export function useMemberDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canReview = user ? ELEVATED_ROLES.includes(user.role) : false;
  const [member, setMember] = useState<MemberDetailData | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [checkResult, setCheckResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<
    | { type: "spouse" }
    | { type: "beneficiary"; id: number; name: string }
    | { type: "approve" }
    | null
  >(null);
  const [editing, setEditing] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editGhanaCard, setEditGhanaCard] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editEmploymentCategory, setEditEmploymentCategory] = useState<"TEACHING" | "NON_TEACHING">(
    "TEACHING",
  );
  const [employmentCategoryNote, setEmploymentCategoryNote] = useState("");
  const lastTeachingSchoolRef = useRef("");
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [confirmingPasswordReset, setConfirmingPasswordReset] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const { districts } = useDistricts();
  const [assigningDistrict, setAssigningDistrict] = useState(false);
  const [assignDistrictId, setAssignDistrictId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [editingSpouse, setEditingSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseGhanaCard, setSpouseGhanaCard] = useState("");
  const [spouseFieldErrors, setSpouseFieldErrors] = useState<
    Partial<Record<"fullName" | "ghanaCardId", string>>
  >({});
  const [addingBeneficiary, setAddingBeneficiary] = useState(false);
  const [newBeneficiary, setNewBeneficiary] = useState({
    fullName: "",
    relationship: "CHILD",
    dateOfBirth: "",
    trusteeName: "",
  });
  const [beneficiaryError, setBeneficiaryError] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [showRemoveForm, setShowRemoveForm] = useState(false);
  const [removeReason, setRemoveReason] = useState("DEATH");
  const [removeNote, setRemoveNote] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const [memberRes, eventsRes] = await Promise.all([
        api.get(`/members/${id}`),
        api.get(`/members/${id}/workflow`),
      ]);
      setMember(memberRes.data.data);
      setEvents(eventsRes.data.data);
    } catch {
      setError("Unable to load this member.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const startEditing = () => {
    if (!member) return;
    setEditFullName(member.fullName);
    setEditGhanaCard(member.ghanaCardId ?? "");
    setEditPhone(member.phone ?? "");
    setEditEmail(member.email ?? "");
    // Non-teaching staff are always recorded under Head Office -- force this even if the stored
    // value is stale (e.g. a member switched to Non-teaching before this field existed, or edited
    // directly some other way), so the edit form never contradicts the employment category.
    setEditSchool(member.employmentCategory === "NON_TEACHING" ? "Head Office" : member.school);
    setEditEmploymentCategory(member.employmentCategory);
    setEditing(true);
  };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.patch(`/members/${id}`, {
        fullName: editFullName.trim(),
        ghanaCardId: editGhanaCard.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        school: editSchool.trim(),
        employmentCategory: editEmploymentCategory,
      });
      // The backend already clears a stale missingFromReport20At on this transition (see
      // member.routes.ts) -- this note is purely to surface a status that stays untouched
      // (member.status is read from before this save, i.e. the pre-transition value) so staff
      // don't have to notice it separately later.
      setEmploymentCategoryNote(
        member?.employmentCategory === "TEACHING" &&
          editEmploymentCategory === "NON_TEACHING" &&
          member?.status === "INACTIVE"
          ? "This member is currently Inactive — review and reactivate separately if appropriate."
          : "",
      );
      setEditing(false);
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to save changes.");
    } finally {
      setBusy(false);
    }
  };
  const generatePassword = async () => {
    setPasswordBusy(true);
    setPasswordError("");
    try {
      const res = await api.post(`/members/${id}/password`);
      setPasswordResult(res.data.password);
      setConfirmingPasswordReset(false);
    } catch (err: unknown) {
      setPasswordError(getApiError(err)?.message || "Unable to generate a password.");
    } finally {
      setPasswordBusy(false);
    }
  };
  const submitAssignDistrict = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignDistrictId) return;
    setAssignBusy(true);
    setAssignError("");
    try {
      await api.patch(`/members/${id}`, {
        districtId: Number(assignDistrictId),
      });
      setAssigningDistrict(false);
      setAssignDistrictId("");
      await load();
    } catch (err: unknown) {
      setAssignError(getApiError(err)?.message || "Unable to assign a district.");
    } finally {
      setAssignBusy(false);
    }
  };
  const startEditingSpouse = () => {
    setSpouseName(member?.spouse?.fullName ?? "");
    setSpouseGhanaCard(member?.spouse?.ghanaCardId ?? "");
    setSpouseFieldErrors({});
    setActionError("");
    setEditingSpouse(true);
  };
  const clearSpouseFieldError = (field: "fullName" | "ghanaCardId") => {
    setSpouseFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const saveSpouse = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    setSpouseFieldErrors({});
    try {
      await api.put(`/members/${id}/spouse`, {
        fullName: spouseName.trim(),
        ghanaCardId: spouseGhanaCard.trim() || null,
      });
      setSpouseFieldErrors({});
      setEditingSpouse(false);
      await load();
    } catch (err: unknown) {
      const issues = getApiError(err)?.errors as
        Array<{ field?: string; message?: string }> | undefined;
      const fieldErrors: Partial<Record<"fullName" | "ghanaCardId", string>> = {};
      issues?.forEach((issue) => {
        if (
          (issue.field === "fullName" || issue.field === "ghanaCardId") &&
          issue.message &&
          !fieldErrors[issue.field]
        ) {
          fieldErrors[issue.field] = issue.message;
        }
      });
      if (Object.keys(fieldErrors).length > 0) {
        setSpouseFieldErrors(fieldErrors);
      } else {
        setActionError(getApiError(err)?.message || "Unable to save spouse.");
      }
    } finally {
      setBusy(false);
    }
  };
  const removeSpouse = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.delete(`/members/${id}/spouse`);
      setConfirmation(null);
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to remove spouse.");
    } finally {
      setBusy(false);
    }
  };
  const addBeneficiary = async (e: FormEvent) => {
    e.preventDefault();
    setBeneficiaryError("");
    if (isMinor(newBeneficiary.dateOfBirth) && !newBeneficiary.trusteeName.trim()) {
      setBeneficiaryError("A trustee name is required for a beneficiary under 18.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/beneficiaries`, {
        fullName: newBeneficiary.fullName.trim(),
        relationship: newBeneficiary.relationship,
        dateOfBirth: newBeneficiary.dateOfBirth || null,
        trusteeName: newBeneficiary.trusteeName.trim() || null,
      });
      setAddingBeneficiary(false);
      setNewBeneficiary({
        fullName: "",
        relationship: "CHILD",
        dateOfBirth: "",
        trusteeName: "",
      });
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to add beneficiary.");
    } finally {
      setBusy(false);
    }
  };
  const removeBeneficiary = async (beneficiaryId: number) => {
    setBusy(true);
    setActionError("");
    try {
      await api.delete(`/members/${id}/beneficiaries/${beneficiaryId}`);
      setConfirmation(null);
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to remove beneficiary.");
    } finally {
      setBusy(false);
    }
  };
  const checkReport20 = async () => {
    setBusy(true);
    setActionError("");
    setCheckResult("");
    try {
      const res = await api.post(`/members/${id}/check-report20`);
      const data = res.data.data;
      if (data.matched) {
        setCheckResult(
          data.alreadyMatched
            ? "Already matched against the latest Report 20 file."
            : `Matched against ${data.checkedImport.fileName} — status updated.`,
        );
        if (!data.alreadyMatched) await load();
      } else {
        setCheckResult(
          data.checkedImport
            ? `${data.message} (checked ${data.checkedImport.fileName})`
            : data.message,
        );
      }
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to check against Report 20.");
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!member) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/approve`);
      setConfirmation(null);
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to approve member.");
    } finally {
      setBusy(false);
    }
  };
  const submitReturn = async (e: FormEvent) => {
    e.preventDefault();
    if (!returnNote.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/return`, { note: returnNote.trim() });
      setShowReturnForm(false);
      setReturnNote("");
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to return member.");
    } finally {
      setBusy(false);
    }
  };
  const submitRemove = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/remove`, {
        reason: removeReason,
        note: removeNote.trim() || null,
      });
      setShowRemoveForm(false);
      setRemoveNote("");
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to remove member.");
    } finally {
      setBusy(false);
    }
  };
  const submitReactivate = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/reactivate`, {});
      await load();
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to reactivate member.");
    } finally {
      setBusy(false);
    }
  };
  return {
    id,
    canReview,
    member,
    events,
    loading,
    error,
    actionError,
    setActionError,
    checkResult,
    busy,
    confirmation,
    setConfirmation,
    editing,
    setEditing,
    editFullName,
    setEditFullName,
    editGhanaCard,
    setEditGhanaCard,
    editPhone,
    setEditPhone,
    editEmail,
    setEditEmail,
    editSchool,
    setEditSchool,
    editEmploymentCategory,
    setEditEmploymentCategory,
    employmentCategoryNote,
    lastTeachingSchoolRef,
    passwordResult,
    setPasswordResult,
    confirmingPasswordReset,
    setConfirmingPasswordReset,
    passwordBusy,
    passwordError,
    districts,
    assigningDistrict,
    setAssigningDistrict,
    assignDistrictId,
    setAssignDistrictId,
    assignBusy,
    assignError,
    editingSpouse,
    setEditingSpouse,
    spouseName,
    setSpouseName,
    spouseGhanaCard,
    setSpouseGhanaCard,
    spouseFieldErrors,
    setSpouseFieldErrors,
    addingBeneficiary,
    setAddingBeneficiary,
    newBeneficiary,
    setNewBeneficiary,
    beneficiaryError,
    showReturnForm,
    setShowReturnForm,
    returnNote,
    setReturnNote,
    showRemoveForm,
    setShowRemoveForm,
    removeReason,
    setRemoveReason,
    removeNote,
    setRemoveNote,
    startEditing,
    saveEdit,
    generatePassword,
    submitAssignDistrict,
    startEditingSpouse,
    clearSpouseFieldError,
    saveSpouse,
    removeSpouse,
    addBeneficiary,
    removeBeneficiary,
    checkReport20,
    approve,
    submitReturn,
    submitRemove,
    submitReactivate,
  };
}
