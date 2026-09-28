import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useDistricts } from "@/lib/useDistricts";
import "./AddMember.css";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { isMinor, parseISODate, toISODate } from "@/lib/utils";
import {
  applyGhanaCardIdChange,
  GHANA_CARD_ID_PREFIX,
  ghanaCardIdOrNull,
  hasGhanaCardIdDigits,
} from "@/lib/ghanaCardId";

const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
const GHANA_CARD = /^GHA-\d{9}-\d$/;

type BeneficiaryDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  trusteeName: string;
};
type Errors = Record<string, string>;
type CreatedMember = { id: number; fullName: string; controllerId: string };

const emptyBeneficiary = (): BeneficiaryDraft => ({
  fullName: "",
  relationship: "CHILD",
  dateOfBirth: "",
  trusteeName: "",
});
function Field({
  label,
  required,
  help,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`enroll-field ${error ? "has-error" : ""}`}>
      <span>
        {label}
        {required && <b>Required</b>}
      </span>
      {children}
      {error ? (
        <small className="enroll-field__error">{error}</small>
      ) : help ? (
        <small>{help}</small>
      ) : null}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="enroll-summary-row">
      <dt>{label}</dt>
      <dd>{value || <span>Not provided</span>}</dd>
    </div>
  );
}

export default function AddMember() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { districts, loading: districtsLoading } = useDistricts();
  const [controllerId, setControllerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"" | "MALE" | "FEMALE">("");
  const [ghanaCardId, setGhanaCardId] = useState(GHANA_CARD_ID_PREFIX);
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [employmentCategory, setEmploymentCategory] = useState<
    "TEACHING" | "NON_TEACHING"
  >("TEACHING");
  const [districtId, setDistrictId] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  // Only relevant when employmentCategory is NON_TEACHING and District isn't set.
  const [placeOfWork, setPlaceOfWork] = useState("");
  const [regionId, setRegionId] = useState("");
  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState(GHANA_CARD_ID_PREFIX);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([
    emptyBeneficiary(),
  ]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedMember | null>(null);
  const [confirmation, setConfirmation] = useState<"exit" | "spouse" | null>(
    null,
  );

  // Remembers the last real school typed before switching to Non-teaching staff, so switching
  // back to Teaching doesn't force retyping it.
  const lastTeachingSchoolRef = useRef("");
  const memberSection = useRef<HTMLElement>(null);
  const employmentSection = useRef<HTMLElement>(null);
  const householdSection = useRef<HTMLElement>(null);
  const selectedDistrict = districts.find(
    (item) => String(item.id) === districtId,
  );
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
    beneficiaries.some(
      (item) => item.fullName || item.dateOfBirth || item.trusteeName,
    ),
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
      ? districts.filter((item) =>
          `${item.name} ${item.region.name}`.toLowerCase().includes(query),
        )
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
  const completedRequired = requiredValues.filter((value) =>
    value.trim(),
  ).length;

  const updateBeneficiary = (index: number, patch: Partial<BeneficiaryDraft>) =>
    setBeneficiaries((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const removeBeneficiary = (index: number) =>
    setBeneficiaries((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  const goTo = (ref: React.RefObject<HTMLElement | null>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const validate = () => {
    const next: Errors = {};
    if (!/^[A-Za-z0-9]{4,20}$/.test(controllerId.trim()))
      next.controllerId = "Enter a Controller ID with 4 to 20 letters/digits.";
    if (fullName.trim().length < 2)
      next.fullName = "Enter the member's full legal name.";
    if (!gender) next.gender = "Select a gender.";
    if (hasGhanaCardIdDigits(ghanaCardId) && !GHANA_CARD.test(ghanaCardId))
      next.ghanaCardId = "Use the format GHA-000000000-0.";
    if (phone && phone.trim().length < 7)
      next.phone = "Enter a valid phone number.";
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
      next.spouseGhanaCardId =
        "Member and spouse cannot use the same Ghana Card ID.";
    // Non-teaching staff aren't required to have a beneficiary on file -- an untouched default
    // draft shouldn't block submission, though anything actually filled in still gets validated.
    beneficiaries.forEach((item, index) => {
      if (isNonTeaching && !item.fullName.trim() && !item.dateOfBirth && !item.trusteeName.trim())
        return;
      if (item.fullName.trim().length < 2)
        next[`beneficiaries.${index}.fullName`] =
          "Enter the beneficiary's full name.";
      if (
        item.dateOfBirth &&
        item.dateOfBirth > new Date().toISOString().slice(0, 10)
      )
        next[`beneficiaries.${index}.dateOfBirth`] =
          "Date cannot be in the future.";
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
    } catch (error: any) {
      const issues = error?.response?.data?.errors as
        | Array<{ field: string; message: string }>
        | undefined;
      if (issues?.length)
        setErrors(
          Object.fromEntries(issues.map((item) => [item.field, item.message])),
        );
      setSubmitError(
        issues?.map((item) => item.message).join(" ") ||
          error?.response?.data?.message ||
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

  if (created)
    return (
      <main className="enroll-success">
        <div className="enroll-success__mark">✓</div>
        <p>Enrollment complete</p>
        <h1>{created.fullName} was added successfully</h1>
        <dl>
          <SummaryRow label="Controller ID" value={created.controllerId} />
          <SummaryRow
            label="Initial status"
            value={<span className="enroll-pending">Pending</span>}
          />
        </dl>
        <div>
          <Link to={`/members/${created.id}`}>View member</Link>
          <button type="button" onClick={startAnother}>
            Add another member
          </button>
        </div>
      </main>
    );

  return (
    <main className="enroll-page">
      <Link
        to="/members"
        className="enroll-back"
        onClick={(event) => {
          if (isDirty) {
            event.preventDefault();
            setConfirmation("exit");
          }
        }}
      >
        ← Members
      </Link>
      <PageHeader
        eyebrow="Member administration"
        title={reviewing ? "Review enrollment" : "New member enrollment"}
        description={
          reviewing
            ? "Confirm the information before creating the member record."
            : "New members begin in Pending status and require workflow approval."
        }
        actions={
          !reviewing ? (
            <div className="enroll-progress" aria-live="polite">
              <strong>
                {completedRequired}/{requiredValues.length}
              </strong>
              <span>required fields complete</span>
            </div>
          ) : undefined
        }
      />

      {submitError && (
        <div className="mb-4">
          <Alert tone="error">
            <strong>Enrollment needs attention:</strong> {submitError}
          </Alert>
        </div>
      )}
      {confirmation && (
        <ConfirmationPanel
          title={
            confirmation === "exit"
              ? "Discard this unfinished enrollment?"
              : "Discard the spouse information entered?"
          }
          description={
            confirmation === "exit"
              ? "The member, employment, covered lives, and beneficiary information entered on this page will be lost."
              : "The spouse fields will be cleared. Spouse details can still be added after enrollment."
          }
          confirmLabel={
            confirmation === "exit"
              ? "Discard enrollment"
              : "Discard spouse details"
          }
          onConfirm={() => {
            if (confirmation === "exit") navigate("/members");
            else {
              setIncludeSpouse(false);
              setSpouseName("");
              setSpouseGhanaCardId(GHANA_CARD_ID_PREFIX);
              setConfirmation(null);
            }
          }}
          onCancel={() => setConfirmation(null)}
        />
      )}

      {reviewing ? (
        <section className="enroll-review">
          <div className="enroll-review__heading">
            <div>
              <p>Ready for confirmation</p>
              <h2>{fullName}</h2>
              <span>Controller ID {controllerId}</span>
            </div>
            <StatusBadge tone="warning">Pending</StatusBadge>
          </div>
          <div className="enroll-review__grid">
            <section>
              <h3>Member information</h3>
              <dl>
                <SummaryRow label="Gender" value={gender === "MALE" ? "Male" : "Female"} />
                <SummaryRow
                  label="Ghana Card"
                  value={hasGhanaCardIdDigits(ghanaCardId) ? ghanaCardId : ""}
                />
                <SummaryRow label="Phone" value={phone} />
              </dl>
            </section>
            <section>
              <h3>Employment and location</h3>
              <dl>
                <SummaryRow label="School" value={school} />
                <SummaryRow
                  label="Employment category"
                  value={
                    employmentCategory === "NON_TEACHING"
                      ? "Non-teaching staff"
                      : "Teaching"
                  }
                />
                {isNonTeaching && !selectedDistrict ? (
                  <>
                    <SummaryRow label="Place of work" value={placeOfWork} />
                    <SummaryRow
                      label="Region"
                      value={
                        needsRegionPicker
                          ? regionOptions.find((r) => String(r.id) === regionId)?.name
                          : ownRegionName
                      }
                    />
                  </>
                ) : (
                  <>
                    <SummaryRow label="District" value={selectedDistrict?.name} />
                    <SummaryRow label="Region" value={selectedDistrict?.region.name} />
                  </>
                )}
              </dl>
            </section>
            <section>
              <h3>Spouse</h3>
              <dl>
                {includeSpouse ? (
                  <>
                    <SummaryRow label="Name" value={spouseName} />
                    <SummaryRow
                      label="Ghana Card"
                      value={hasGhanaCardIdDigits(spouseGhanaCardId) ? spouseGhanaCardId : ""}
                    />
                  </>
                ) : (
                  <SummaryRow label="Recorded" value="No" />
                )}
              </dl>
            </section>
            <section>
              <h3>Beneficiaries ({beneficiaries.filter((item) => item.fullName.trim()).length})</h3>
              <ol>
                {beneficiaries
                  .filter((item) => item.fullName.trim())
                  .map((item, index) => (
                  <li key={index}>
                    <strong>{item.fullName}</strong>
                    <span>
                      {item.relationship.toLowerCase()}
                      {isMinor(item.dateOfBirth) ? ", minor" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <footer className="enroll-review__actions">
            <button type="button" onClick={() => setReviewing(false)}>
              Back to edit
            </button>
            <button
              className="primary"
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Enrolling…" : "Enroll member"}
            </button>
          </footer>
        </section>
      ) : (
        <div className="enroll-workspace">
          <aside className="enroll-nav">
            <p>Enrollment</p>
            <button onClick={() => goTo(memberSection)}>
              <i>1</i>
              <span>
                Member information<small>Identity and contact</small>
              </span>
            </button>
            <button onClick={() => goTo(employmentSection)}>
              <i>2</i>
              <span>
                Employment<small>School and location</small>
              </span>
            </button>
            <button onClick={() => goTo(householdSection)}>
              <i>3</i>
              <span>
                Covered lives<small>Spouse and beneficiaries</small>
              </span>
            </button>
            <div>
              <strong>Initial status</strong>
              <span className="enroll-pending">Pending</span>
              <small>Approval follows enrollment.</small>
            </div>
          </aside>

          <form className="enroll-form" onSubmit={review} noValidate>
            <section ref={memberSection} id="member-information">
              <div className="enroll-section-title">
                <i>1</i>
                <div>
                  <h2>Member information</h2>
                  <p>Use the member's official identification details.</p>
                </div>
              </div>
              <div className="enroll-fields">
                <Field
                  label="Controller ID"
                  required
                  help="4 to 20 letters/digits"
                  error={errors.controllerId}
                >
                  <input
                    autoFocus
                    value={controllerId}
                    onChange={(event) =>
                      setControllerId(event.target.value.toUpperCase().slice(0, 20))
                    }
                    placeholder="e.g. 4545845 or GNATNT2020001"
                  />
                </Field>
                <Field label="Full legal name" required error={errors.fullName}>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="As shown on official records"
                  />
                </Field>
                <Field label="Gender" required error={errors.gender}>
                  <Dropdown
                    value={gender}
                    onChange={(value) => setGender(value as "MALE" | "FEMALE")}
                    placeholder="Select a gender"
                    options={[
                      { value: "MALE", label: "Male" },
                      { value: "FEMALE", label: "Female" },
                    ]}
                  />
                </Field>
                <Field
                  label="Ghana Card ID"
                  help="Format: GHA-000000000-0"
                  error={errors.ghanaCardId}
                >
                  <input
                    value={ghanaCardId}
                    onChange={(event) =>
                      setGhanaCardId(applyGhanaCardIdChange(event))
                    }
                    placeholder="GHA-000000000-0"
                  />
                </Field>
                <Field
                  label="Phone number"
                  help="Used for member portal verification"
                  error={errors.phone}
                >
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="e.g. 024 000 0000"
                  />
                </Field>
              </div>
            </section>

            <section ref={employmentSection} id="employment">
              <div className="enroll-section-title">
                <i>2</i>
                <div>
                  <h2>Employment and location</h2>
                  <p>Assign the member to the correct administrative scope.</p>
                </div>
              </div>
              <div className="enroll-fields">
                <Field
                  label="School"
                  required={employmentCategory === "TEACHING"}
                  error={errors.school}
                  help={
                    employmentCategory === "NON_TEACHING"
                      ? "Non-teaching staff are recorded under Head Office, not a school."
                      : undefined
                  }
                >
                  <input
                    value={school}
                    disabled={employmentCategory === "NON_TEACHING"}
                    onChange={(event) => setSchool(event.target.value)}
                    placeholder="School or institution"
                  />
                </Field>
                <Field
                  label="Employment category"
                  help="Non-teaching staff are not checked against Report 20"
                >
                  <Dropdown
                    value={employmentCategory}
                    onChange={(value) => {
                      const next = value as "TEACHING" | "NON_TEACHING";
                      setEmploymentCategory(next);
                      if (next === "NON_TEACHING") {
                        if (school.trim()) lastTeachingSchoolRef.current = school;
                        setSchool("Head Office");
                      } else if (school === "Head Office") {
                        setSchool(lastTeachingSchoolRef.current);
                      }
                    }}
                    options={[
                      { value: "TEACHING", label: "Teaching" },
                      { value: "NON_TEACHING", label: "Non-teaching staff" },
                    ]}
                  />
                </Field>
                <Field
                  label="Find district"
                  help="Search by district or region"
                >
                  <input
                    value={districtSearch}
                    onChange={(event) => setDistrictSearch(event.target.value)}
                    placeholder="Type to narrow the list"
                  />
                </Field>
                <Field
                  label="District"
                  required={!isNonTeaching}
                  error={errors.districtId}
                  help={
                    isNonTeaching
                      ? "Optional for non-teaching staff — use Place of work instead."
                      : undefined
                  }
                >
                  <Dropdown
                    value={districtId}
                    disabled={districtsLoading}
                    onChange={setDistrictId}
                    placeholder={
                      districtsLoading
                        ? "Loading districts…"
                        : "Select a district"
                    }
                    groups={groupedDistricts.map((group) => ({
                      label: group.region,
                      options: group.districts.map((item) => ({
                        value: String(item.id),
                        label: item.name,
                      })),
                    }))}
                  />
                </Field>
                {selectedDistrict && (
                  <div className="enroll-location">
                    <span>Selected location</span>
                    <strong>{selectedDistrict.name}</strong>
                    <small>{selectedDistrict.region.name} Region</small>
                  </div>
                )}
                {isNonTeaching && !districtId && (
                  <>
                    <Field
                      label="Place of work"
                      required
                      error={errors.placeOfWork}
                      help="Free text — where this member is stationed."
                    >
                      <input
                        value={placeOfWork}
                        onChange={(event) => setPlaceOfWork(event.target.value)}
                        placeholder="e.g. Head Office, Finance Unit"
                      />
                    </Field>
                    {needsRegionPicker ? (
                      <Field label="Region" required error={errors.regionId}>
                        <Dropdown
                          value={regionId}
                          onChange={setRegionId}
                          placeholder="Select a region"
                          options={regionOptions.map((r) => ({
                            value: String(r.id),
                            label: r.name,
                          }))}
                        />
                      </Field>
                    ) : (
                      <Field label="Region" help="Fixed to your own region.">
                        <input value={ownRegionName} disabled readOnly />
                      </Field>
                    )}
                  </>
                )}
              </div>
            </section>

            <section ref={householdSection} id="household">
              <div className="enroll-section-title">
                <i>3</i>
                <div>
                  <h2>Covered lives</h2>
                  <p>Record spouse and beneficiary information.</p>
                </div>
              </div>
              <div className="enroll-spouse">
                <div>
                  <strong>Does this member have a spouse to record?</strong>
                  <span>Spouse details can also be added later.</span>
                </div>
                <div>
                  <button
                    type="button"
                    className={!includeSpouse ? "active" : ""}
                    onClick={() => {
                      if (
                        !includeSpouse ||
                        (!spouseName && !hasGhanaCardIdDigits(spouseGhanaCardId))
                      )
                        setIncludeSpouse(false);
                      else setConfirmation("spouse");
                    }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className={includeSpouse ? "active" : ""}
                    onClick={() => setIncludeSpouse(true)}
                  >
                    Yes
                  </button>
                </div>
              </div>
              {includeSpouse && (
                <div className="enroll-fields enroll-spouse-fields">
                  <Field
                    label="Spouse full name"
                    required
                    error={errors.spouseName}
                  >
                    <input
                      value={spouseName}
                      onChange={(event) => setSpouseName(event.target.value)}
                    />
                  </Field>
                  <Field label="Ghana Card ID" error={errors.spouseGhanaCardId}>
                    <input
                      value={spouseGhanaCardId}
                      onChange={(event) =>
                        setSpouseGhanaCardId(applyGhanaCardIdChange(event))
                      }
                      placeholder="GHA-000000000-0"
                    />
                  </Field>
                </div>
              )}

              <div className="enroll-beneficiary-heading">
                <div>
                  <h3>Beneficiaries</h3>
                  <p>
                    {isNonTeaching
                      ? "Optional for non-teaching staff. Up to 10 may be recorded."
                      : "At least one beneficiary is required. Up to 10 may be recorded."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={beneficiaries.length >= 10}
                  onClick={() =>
                    setBeneficiaries((current) => [
                      ...current,
                      emptyBeneficiary(),
                    ])
                  }
                >
                  + Add beneficiary
                </button>
              </div>
              <div className="enroll-beneficiaries">
                {beneficiaries.map((item, index) => (
                  <article key={index}>
                    <header>
                      <span>{index + 1}</span>
                      <div>
                        <strong>Beneficiary {index + 1}</strong>
                        <small>{item.fullName || "Details not complete"}</small>
                      </div>
                      {beneficiaries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBeneficiary(index)}
                        >
                          Remove
                        </button>
                      )}
                    </header>
                    <div className="enroll-fields">
                      <Field
                        label="Full name"
                        required
                        error={errors[`beneficiaries.${index}.fullName`]}
                      >
                        <input
                          value={item.fullName}
                          onChange={(event) =>
                            updateBeneficiary(index, {
                              fullName: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field label="Relationship" required>
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
                      </Field>
                      <div>
                        <DatePicker
                          label="Date of birth"
                          error={errors[`beneficiaries.${index}.dateOfBirth`]}
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
                        <Field
                          label="Trustee name"
                          required
                          help="Required for a beneficiary under 18"
                          error={
                            errors[`beneficiaries.${index}.trusteeName`]
                          }
                        >
                          <input
                            value={item.trusteeName}
                            onChange={(event) =>
                              updateBeneficiary(index, {
                                trusteeName: event.target.value,
                              })
                            }
                          />
                        </Field>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <footer className="enroll-footer">
              <Link
                to="/members"
                onClick={(event) => {
                  if (isDirty) {
                    event.preventDefault();
                    setConfirmation("exit");
                  }
                }}
              >
                Cancel
              </Link>
              <div>
                <span>
                  {completedRequired} of {requiredValues.length} required fields
                  complete
                </span>
                <button type="submit">Review enrollment</button>
              </div>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
