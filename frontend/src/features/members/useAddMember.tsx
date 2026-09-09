import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useDistricts } from "@/lib/useDistricts";
import { isMinor } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  emptyBeneficiary,
  GHANA_CARD,
  type BeneficiaryDraft,
  type CreatedMember,
  type Errors,
} from "./AddMember.model";
export function useAddMember() {
  const navigate = useNavigate();
  const { districts, loading: districtsLoading } = useDistricts();
  const [controllerId, setControllerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [ghanaCardId, setGhanaCardId] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [employmentCategory, setEmploymentCategory] = useState<"TEACHING" | "NON_TEACHING">(
    "TEACHING",
  );
  const [districtId, setDistrictId] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([emptyBeneficiary()]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedMember | null>(null);
  const [confirmation, setConfirmation] = useState<"exit" | "spouse" | null>(null);
  const lastTeachingSchoolRef = useRef("");
  const memberSection = useRef<HTMLElement>(null);
  const employmentSection = useRef<HTMLElement>(null);
  const householdSection = useRef<HTMLElement>(null);
  const selectedDistrict = districts.find((item) => String(item.id) === districtId);
  const isDirty = Boolean(
    controllerId ||
    fullName ||
    ghanaCardId ||
    phone ||
    school ||
    districtId ||
    includeSpouse ||
    beneficiaries.some((item) => item.fullName || item.dateOfBirth || item.trusteeName),
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isDirty && !created) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [created, isDirty]);
  const groupedDistricts = useMemo(() => {
    const query = districtSearch.trim().toLowerCase();
    const filtered = query
      ? districts.filter((item) => `${item.name} ${item.region.name}`.toLowerCase().includes(query))
      : districts;
    return Array.from(new Set(filtered.map((item) => item.region.name)))
      .sort()
      .map((region) => ({
        region,
        districts: filtered.filter((item) => item.region.name === region),
      }));
  }, [districtSearch, districts]);
  const requiredValues = [
    controllerId,
    fullName,
    school,
    districtId,
    beneficiaries[0]?.fullName ?? "",
    ...(includeSpouse ? [spouseName] : []),
  ];
  const completedRequired = requiredValues.filter((value) => value.trim()).length;
  const updateBeneficiary = (index: number, patch: Partial<BeneficiaryDraft>) =>
    setBeneficiaries((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  const removeBeneficiary = (index: number) =>
    setBeneficiaries((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const goTo = (ref: React.RefObject<HTMLElement | null>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const validate = () => {
    const next: Errors = {};
    if (!/^\d{4,7}$/.test(controllerId.trim()))
      next.controllerId = "Enter a Controller ID containing 4 to 7 digits.";
    if (fullName.trim().length < 2) next.fullName = "Enter the member's full legal name.";
    if (ghanaCardId && !GHANA_CARD.test(ghanaCardId))
      next.ghanaCardId = "Use the format GHA-000000000-0.";
    if (phone && phone.trim().length < 7) next.phone = "Enter a valid phone number.";
    if (school.trim().length < 2) next.school = "Enter the member's school.";
    if (!districtId) next.districtId = "Select a district.";
    if (includeSpouse && spouseName.trim().length < 2)
      next.spouseName = "Enter the spouse's full name.";
    if (spouseGhanaCardId && !GHANA_CARD.test(spouseGhanaCardId))
      next.spouseGhanaCardId = "Use the format GHA-000000000-0.";
    if (ghanaCardId && spouseGhanaCardId && ghanaCardId === spouseGhanaCardId)
      next.spouseGhanaCardId = "Member and spouse cannot use the same Ghana Card ID.";
    beneficiaries.forEach((item, index) => {
      if (item.fullName.trim().length < 2)
        next[`beneficiaries.${index}.fullName`] = "Enter the beneficiary's full name.";
      if (item.dateOfBirth && item.dateOfBirth > new Date().toISOString().slice(0, 10))
        next[`beneficiaries.${index}.dateOfBirth`] = "Date cannot be in the future.";
      if (isMinor(item.dateOfBirth) && !item.trusteeName.trim())
        next[`beneficiaries.${index}.trusteeName`] =
          "Trustee name is required for a beneficiary under 18.";
    });
    setErrors(next);
    if (Object.keys(next).length) {
      setSubmitError("Review the highlighted fields before continuing.");
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            ".enroll-field.has-error input, .enroll-field.has-error select",
          )
          ?.focus(),
      );
      return false;
    }
    setSubmitError("");
    return true;
  };
  const review = (event: FormEvent) => {
    event.preventDefault();
    if (validate()) {
      setReviewing(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const submit = async () => {
    if (!validate()) {
      setReviewing(false);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await api.post("/members", {
        controllerId: controllerId.trim(),
        fullName: fullName.trim(),
        ghanaCardId: ghanaCardId || null,
        phone: phone.trim() || null,
        school: school.trim(),
        employmentCategory,
        districtId: Number(districtId),
        spouse: includeSpouse
          ? {
              fullName: spouseName.trim(),
              ghanaCardId: spouseGhanaCardId || null,
            }
          : null,
        beneficiaries: beneficiaries.map((item) => ({
          fullName: item.fullName.trim(),
          relationship: item.relationship,
          dateOfBirth: item.dateOfBirth || null,
          trusteeName: item.trusteeName.trim() || null,
        })),
      });
      setCreated(response.data.data);
      setReviewing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: unknown) {
      const issues = getApiError(error)?.errors as
        Array<{ field: string; message: string }> | undefined;
      if (issues?.length)
        setErrors(Object.fromEntries(issues.map((item) => [item.field, item.message])));
      setSubmitError(
        issues?.map((item) => item.message).join(" ") ||
          getApiError(error)?.message ||
          "This member could not be enrolled.",
      );
      setReviewing(false);
    } finally {
      setSubmitting(false);
    }
  };
  const startAnother = () => {
    setControllerId("");
    setFullName("");
    setGhanaCardId("");
    setPhone("");
    setSchool("");
    setEmploymentCategory("TEACHING");
    setDistrictId("");
    setDistrictSearch("");
    setIncludeSpouse(false);
    setSpouseName("");
    setSpouseGhanaCardId("");
    setBeneficiaries([emptyBeneficiary()]);
    setErrors({});
    setSubmitError("");
    setCreated(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return {
    navigate,
    districts,
    districtsLoading,
    controllerId,
    setControllerId,
    fullName,
    setFullName,
    ghanaCardId,
    setGhanaCardId,
    phone,
    setPhone,
    school,
    setSchool,
    employmentCategory,
    setEmploymentCategory,
    districtId,
    setDistrictId,
    districtSearch,
    setDistrictSearch,
    includeSpouse,
    setIncludeSpouse,
    spouseName,
    setSpouseName,
    spouseGhanaCardId,
    setSpouseGhanaCardId,
    beneficiaries,
    setBeneficiaries,
    errors,
    submitError,
    reviewing,
    setReviewing,
    submitting,
    created,
    confirmation,
    setConfirmation,
    lastTeachingSchoolRef,
    memberSection,
    employmentSection,
    householdSection,
    selectedDistrict,
    isDirty,
    groupedDistricts,
    requiredValues,
    completedRequired,
    updateBeneficiary,
    removeBeneficiary,
    goTo,
    review,
    submit,
    startAnother,
  };
}
