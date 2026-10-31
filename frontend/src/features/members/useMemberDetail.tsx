import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { GHANA_CARD_ID_PREFIX, ghanaCardIdOrNull } from "@/lib/ghanaCardId";
import { useDistricts } from "@/lib/useDistricts";
import { isMinor } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { ELEVATED_ROLES, type MemberDetailData, type WorkflowEvent } from "./MemberDetail.model";
export function useMemberDetail() {
  const { id } = useParams();
  const activeId = useRef(id);
  const loadAbort = useRef<AbortController | null>(null);
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
  const [editGender, setEditGender] = useState<"" | "MALE" | "FEMALE">("");
  const [editGhanaCard, setEditGhanaCard] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSchool, setEditSchool] = useState("");
  const [editEmploymentCategory, setEditEmploymentCategory] = useState<"TEACHING" | "NON_TEACHING">(
    "TEACHING",
  );
  // Only relevant when editEmploymentCategory is NON_TEACHING and the member has no district.
  const [editPlaceOfWork, setEditPlaceOfWork] = useState("");
  const [editRegionId, setEditRegionId] = useState("");
  const [employmentCategoryNote, setEmploymentCategoryNote] = useState("");
  const lastTeachingSchoolRef = useRef("");
  const needsRegionPicker = user?.role === "SUPER_ADMIN" || user?.role === "NATIONAL_ADMIN";
  const [passwordResult, setPasswordResult] = useState<string | null>(null);
  const [confirmingPasswordReset, setConfirmingPasswordReset] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const { districts } = useDistricts();
  const regionOptions = useMemo(() => {
    const map = new Map<number, string>();
    districts.forEach((item) => map.set(item.region.id, item.region.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [districts]);
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
  const load = useCallback(async () => {
    if (activeId.current !== id) return;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    setError("");
    setLoading(true);
    try {
      const [memberRes, eventsRes] = await Promise.all([
        api.get(`/members/${id}`, { signal: controller.signal }),
        api.get(`/members/${id}/workflow`, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted || activeId.current !== id) return;
      setMember(memberRes.data.data);
      setEvents(eventsRes.data.data);
    } catch {
      if (!controller.signal.aborted && activeId.current === id)
        setError("Unable to load this member.");
    } finally {
      if (!controller.signal.aborted && activeId.current === id) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    activeId.current = id;
    setBusy(false);
    setPasswordBusy(false);
    setAssignBusy(false);
    setPasswordError("");
    setAssignError("");
    setAssignDistrictId("");
    setBeneficiaryError("");
    setEmploymentCategoryNote("");
    setCheckResult("");
    setReturnNote("");
    setRemoveNote("");
    setSpouseFieldErrors({});
    setNewBeneficiary({ fullName: "", relationship: "CHILD", dateOfBirth: "", trusteeName: "" });
    setEditing(false);
    setEditingSpouse(false);
    setAddingBeneficiary(false);
    setConfirmation(null);
    setShowReturnForm(false);
    setShowRemoveForm(false);
    setPasswordResult(null);
    setConfirmingPasswordReset(false);
    setAssigningDistrict(false);
    setActionError("");
    void load();
    return () => {
      activeId.current = undefined;
      loadAbort.current?.abort();
    };
  }, [id, load]);
  const startEditing = () => {
    if (!member) return;
    setEditFullName(member.fullName);
    setEditGender(member.gender ?? "");
    setEditGhanaCard(member.ghanaCardId ?? GHANA_CARD_ID_PREFIX);
    setEditPhone(member.phone ?? "");
    setEditEmail(member.email ?? "");
    // Non-teaching staff are always recorded under Head Office -- force this even if the stored
    // value is stale (e.g. a member switched to Non-teaching before this field existed, or edited
    // directly some other way), so the edit form never contradicts the employment category.
    setEditSchool(member.employmentCategory === "NON_TEACHING" ? "Head Office" : member.school);
    setEditEmploymentCategory(member.employmentCategory);
    setEditPlaceOfWork(member.placeOfWork ?? "");
    setEditRegionId(member.region ? String(member.region.id) : "");
    setEditing(true);
  };
  const saveEdit = async (e: FormEvent) => {
    if (activeId.current !== id) return;
    e.preventDefault();
    setBusy(true);
    setActionError("");
    const switchingToNonTeaching =
      member?.employmentCategory !== "NON_TEACHING" && editEmploymentCategory === "NON_TEACHING";
    try {
      await api.patch(`/members/${id}`, {
        fullName: editFullName.trim(),
        // Editable but never required to save -- fixing an unrelated field on a legacy member
        // with no gender on file shouldn't be blocked by that (only create requires it).
        ...(editGender ? { gender: editGender } : {}),
        ghanaCardId: ghanaCardIdOrNull(editGhanaCard.trim()),
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        school: editSchool.trim(),
        employmentCategory: editEmploymentCategory,
        ...(editEmploymentCategory === "NON_TEACHING" && !member?.district
          ? {
              placeOfWork: editPlaceOfWork.trim(),
              ...(switchingToNonTeaching && !member?.district && needsRegionPicker && editRegionId
                ? { regionId: Number(editRegionId) }
                : {}),
            }
          : {}),
      });
      if (activeId.current !== id) return;
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
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to save changes.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const generatePassword = async () => {
    if (activeId.current !== id) return;
    setPasswordBusy(true);
    setPasswordError("");
    try {
      const res = await api.post(`/members/${id}/password`);
      if (activeId.current !== id) return;
      setPasswordResult(res.data.password);
      setConfirmingPasswordReset(false);
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setPasswordError(getApiError(err)?.message || "Unable to generate a password.");
    } finally {
      if (activeId.current === id) {
        setPasswordBusy(false);
      }
    }
  };
  const submitAssignDistrict = async (e: FormEvent) => {
    if (activeId.current !== id) return;
    e.preventDefault();
    if (!assignDistrictId) return;
    setAssignBusy(true);
    setAssignError("");
    try {
      await api.patch(`/members/${id}`, {
        districtId: Number(assignDistrictId),
      });
      if (activeId.current !== id) return;
      setAssigningDistrict(false);
      setAssignDistrictId("");
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setAssignError(getApiError(err)?.message || "Unable to assign a district.");
    } finally {
      if (activeId.current === id) {
        setAssignBusy(false);
      }
    }
  };
  const startEditingSpouse = () => {
    setSpouseName(member?.spouse?.fullName ?? "");
    setSpouseGhanaCard(member?.spouse?.ghanaCardId ?? GHANA_CARD_ID_PREFIX);
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
    if (activeId.current !== id) return;
    e.preventDefault();
    setBusy(true);
    setActionError("");
    setSpouseFieldErrors({});
    try {
      await api.put(`/members/${id}/spouse`, {
        fullName: spouseName.trim(),
        ghanaCardId: ghanaCardIdOrNull(spouseGhanaCard.trim()),
      });
      if (activeId.current !== id) return;
      setSpouseFieldErrors({});
      setEditingSpouse(false);
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
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
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const removeSpouse = async () => {
    if (activeId.current !== id) return;
    setBusy(true);
    setActionError("");
    try {
      await api.delete(`/members/${id}/spouse`);
      if (activeId.current !== id) return;
      setConfirmation(null);
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to remove spouse.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const addBeneficiary = async (e: FormEvent) => {
    if (activeId.current !== id) return;
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
      if (activeId.current !== id) return;
      setAddingBeneficiary(false);
      setNewBeneficiary({
        fullName: "",
        relationship: "CHILD",
        dateOfBirth: "",
        trusteeName: "",
      });
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to add beneficiary.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const removeBeneficiary = async (beneficiaryId: number) => {
    if (activeId.current !== id) return;
    setBusy(true);
    setActionError("");
    try {
      await api.delete(`/members/${id}/beneficiaries/${beneficiaryId}`);
      if (activeId.current !== id) return;
      setConfirmation(null);
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to remove beneficiary.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const checkReport20 = async () => {
    if (activeId.current !== id) return;
    setBusy(true);
    setActionError("");
    setCheckResult("");
    try {
      const res = await api.post(`/members/${id}/check-report20`);
      if (activeId.current !== id) return;
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
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to check against Report 20.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const approve = async () => {
    if (activeId.current !== id) return;
    if (!member) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/approve`);
      if (activeId.current !== id) return;
      setConfirmation(null);
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to approve member.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const submitReturn = async (e: FormEvent) => {
    if (activeId.current !== id) return;
    e.preventDefault();
    if (!returnNote.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/return`, { note: returnNote.trim() });
      if (activeId.current !== id) return;
      setShowReturnForm(false);
      setReturnNote("");
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to return member.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const submitRemove = async (e: FormEvent) => {
    if (activeId.current !== id) return;
    e.preventDefault();
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/remove`, {
        reason: removeReason,
        note: removeNote.trim() || null,
      });
      if (activeId.current !== id) return;
      setShowRemoveForm(false);
      setRemoveNote("");
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to remove member.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  const submitReactivate = async () => {
    if (activeId.current !== id) return;
    setBusy(true);
    setActionError("");
    try {
      await api.post(`/members/${id}/reactivate`, {});
      if (activeId.current !== id) return;
      await load();
    } catch (err: unknown) {
      if (activeId.current !== id) return;
      setActionError(getApiError(err)?.message || "Unable to reactivate member.");
    } finally {
      if (activeId.current === id) {
        setBusy(false);
      }
    }
  };
  return {
    id,
    canReview,
    member: member?.id === Number(id) ? member : null,
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
    editGender,
    setEditGender,
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
    editPlaceOfWork,
    setEditPlaceOfWork,
    editRegionId,
    setEditRegionId,
    needsRegionPicker,
    regionOptions,
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
