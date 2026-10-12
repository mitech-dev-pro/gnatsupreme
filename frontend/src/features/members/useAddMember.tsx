import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useAuth } from "@/lib/AuthContext";
import { useDistricts } from "@/lib/useDistricts";
import {
  GHANA_CARD_ID_PREFIX,
  ghanaCardIdOrNull,
  hasGhanaCardIdDigits,
} from "@/lib/ghanaCardId";
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
  const { user } = useAuth();
  const { districts, loading: districtsLoading } = useDistricts();
  const [controllerId, setControllerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"" | "MALE" | "FEMALE">("");
  const [ghanaCardId, setGhanaCardId] = useState(GHANA_CARD_ID_PREFIX);
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [employmentCategory, setEmploymentCategory] = useState<"TEACHING" | "NON_TEACHING">(
    "TEACHING",
  );
  const [districtId, setDistrictId] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  // Only relevant when employmentCategory is NON_TEACHING and District isn't set.
  const [placeOfWork, setPlaceOfWork] = useState("");
  const [regionId, setRegionId] = useState("");
  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState(GHANA_CARD_ID_PREFIX);
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
  const isNonTeaching = employmentCategory === "NON_TEACHING";
  // REGIONAL_ADMIN/DISTRICT_ADMIN never pick a region themselves -- it's always their own, fixed
  // and read-only (mirrors resolveMemberRegionId server-side). Only SUPER_ADMIN/NATIONAL_ADMIN,
  // who have no fixed region, get a real picker.
  const needsRegionPicker = user?.role === "SUPER_ADMIN" || user?.role === "NATIONAL_ADMIN";
  const regionOptions = useMemo(() => {
    const map = new Map<number, string>();
    districts.forEach((item) => map.set(item.region.id, item.region.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [districts]);
  const ownRegionName = useMemo(() => {
    if (user?.role === "REGIONAL_ADMIN") {
      return regionOptions.find((r) => r.id === user.regionId)?.name ?? "";
    }
    if (user?.role === "DISTRICT_ADMIN") {
      return districts.find((item) => item.id === user.districtId)?.region.name ?? "";
    }
    return "";
  }, [user, districts, regionOptions]);
  const isDirty = Boolean(
    controllerId ||
    fullName ||
    gender ||
    hasGhanaCardIdDigits(ghanaCardId) ||
    phone ||
    school ||
    districtId ||
    placeOfWork ||
    regionId ||
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
    gender,
    ...(isNonTeaching
      ? [placeOfWork, ...(needsRegionPicker ? [regionId] : [])]
      : [school, districtId, beneficiaries[0]?.fullName ?? ""]),
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
    if (!/^[A-Za-z0-9]{4,20}$/.test(controllerId.trim()))
      next.controllerId = "Enter a Controller ID with 4 to 20 letters/digits.";
    if (fullName.trim().length < 2) next.fullName = "Enter the member's full legal name.";
    if (!gender) next.gender = "Select a gender.";
    if (hasGhanaCardIdDigits(ghanaCardId) && !GHANA_CARD.test(ghanaCardId))
      next.ghanaCardId = "Use the format GHA-000000000-0.";
    if (phone && phone.trim().length < 7) next.phone = "Enter a valid phone number.";
    if (isNonTeaching) {
      if (placeOfWork.trim().length < 2)
        next.placeOfWork = "Enter the member's place of work.";
      if (needsRegionPicker && !regionId) next.regionId = "Select a region.";
    } else {
      if (school.trim().length < 2) next.school = "Enter the member's school.";
      if (!districtId) next.districtId = "Select a district.";
    }
    if (includeSpouse && spouseName.trim().length < 2)
      next.spouseName = "Enter the spouse's full name.";
    if (hasGhanaCardIdDigits(spouseGhanaCardId) && !GHANA_CARD.test(spouseGhanaCardId))
      next.spouseGhanaCardId = "Use the format GHA-000000000-0.";
    if (
      hasGhanaCardIdDigits(ghanaCardId) &&
      hasGhanaCardIdDigits(spouseGhanaCardId) &&
      ghanaCardId === spouseGhanaCardId
    )
      next.spouseGhanaCardId = "Member and spouse cannot use the same Ghana Card ID.";
    // Non-teaching staff aren't required to have a beneficiary on file -- an untouched default
    // draft shouldn't block submission, though anything actually filled in still gets validated.
    beneficiaries.forEach((item, index) => {
      if (isNonTeaching && !item.fullName.trim() && !item.dateOfBirth && !item.trusteeName.trim())
        return;
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
        gender,
        ghanaCardId: ghanaCardIdOrNull(ghanaCardId),
        phone: phone.trim() || null,
        school: school.trim(),
        employmentCategory,
        districtId: districtId ? Number(districtId) : null,
        placeOfWork: isNonTeaching ? placeOfWork.trim() : null,
        regionId: isNonTeaching && needsRegionPicker && regionId ? Number(regionId) : undefined,
        spouse: includeSpouse
          ? {
              fullName: spouseName.trim(),
              ghanaCardId: ghanaCardIdOrNull(spouseGhanaCardId),
            }
          : null,
        beneficiaries: beneficiaries
          .filter((item) => item.fullName.trim())
          .map((item) => ({
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
    setGender("");
    setGhanaCardId(GHANA_CARD_ID_PREFIX);
    setPhone("");
    setSchool("");
    setEmploymentCategory("TEACHING");
    setDistrictId("");
    setDistrictSearch("");
    setPlaceOfWork("");
    setRegionId("");
    setIncludeSpouse(false);
    setSpouseName("");
    setSpouseGhanaCardId(GHANA_CARD_ID_PREFIX);
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
    gender,
    setGender,
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
    placeOfWork,
    setPlaceOfWork,
    regionId,
    setRegionId,
    isNonTeaching,
    needsRegionPicker,
    regionOptions,
    ownRegionName,
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
