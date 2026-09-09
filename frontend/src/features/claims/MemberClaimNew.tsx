import { DeathDisabilitySection } from "./DeathDisabilitySection";
import { CriticalIllnessSection } from "./CriticalIllnessSection";
import { HospitalizationSection } from "./HospitalizationSection";
import { ClaimPaymentSection } from "./ClaimPaymentSection";
import { SectionTitle, ReadOnlyField, Progress } from "./ClaimFormLayout";
import type { ContactDetails } from "./claimForm.types";
import ClaimDocumentChecklist, {
  type UploadedClaimDocument,
} from "@/components/claims/ClaimDocumentChecklist";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { InputField } from "@/components/ui/FormField";
import api from "@/lib/api";
import {
  CLAIM_TYPES,
  claimSupportsSpouse,
  hasRequiredDocuments,
  HOSPITALIZATION_MINIMUM_NIGHTS,
  nightsBetween,
  type ClaimType,
} from "@/lib/claimDocuments";
import { getApiError } from "@/lib/errorExtract";
import { formatGhanaCardIdInput } from "@/lib/ghanaCardId";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";

type Profile = {
  id: number;
  controllerId: string;
  fullName: string;
  phone: string | null;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
  spouse: { fullName: string; ghanaCardId: string | null } | null;
};

type BenefitPlan = {
  benefits: { type: string; enabled: boolean; namedConditions: string[] }[];
} | null;

const PAGE_LABELS = ["Claim details", "Payment and declaration"];

export default function MemberClaimNew() {
  const navigate = useNavigate();
  const submissionKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const { id: resubmitId } = useParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [benefitPlan, setBenefitPlan] = useState<BenefitPlan>(null);
  const [page, setPage] = useState(0);
  const [claimType, setClaimType] = useState<ClaimType | "">("");
  const [claimantType, setClaimantType] = useState<"MEMBER" | "SPOUSE">("MEMBER");
  const claimantIdType = "GHANA_CARD";
  const [claimantIdNumber, setClaimantIdNumber] = useState("");
  const [documents, setDocuments] = useState<UploadedClaimDocument[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [docError, setDocError] = useState("");

  const [subjectName, setSubjectName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [dateOfEvent, setDateOfEvent] = useState("");
  const [cause, setCause] = useState("");

  const [diagnosisDate, setDiagnosisDate] = useState("");
  const [diagnosingHospital, setDiagnosingHospital] = useState("");
  const [diagnosingPhysician, setDiagnosingPhysician] = useState("");
  const [illness, setIllness] = useState("");
  const [illnessOther, setIllnessOther] = useState("");

  const [hospitalName, setHospitalName] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");
  const [dischargeDate, setDischargeDate] = useState("");
  const [reason, setReason] = useState("");

  const [contact, setContact] = useState<ContactDetails>({
    fullName: "",
    primaryPhone: "",
    additionalPhone: "",
    email: "",
    gpsAddress: "",
    residentialAddress: "",
    nationality: "Ghanaian",
  });
  // Mode of payment is always cheque in practice, so this isn't a user choice.
  const paymentMethod = "CHEQUE";
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get("/member-portal/profile");
        const found = response.data.data.member as Profile;
        setProfile(found);
        setBenefitPlan(response.data.data.benefitPlan);
        setContact({
          fullName: found.fullName,
          primaryPhone: found.phone ?? "",
          additionalPhone: "",
          email: "",
          gpsAddress: "",
          residentialAddress: "",
          nationality: "Ghanaian",
        });

        if (resubmitId) {
          const claimResponse = await api.get(`/member-portal/claims/${resubmitId}`);
          const claim = claimResponse.data.data;
          const details = claim.claimDetails ?? {};
          setClaimType(claim.claimType);
          setClaimantType(claim.claimantType ?? "MEMBER");
          setClaimantIdNumber(claim.claimantIdNumber ?? "");
          if (claim.claimantContact) setContact(claim.claimantContact);
          setPaymentDetails(claim.paymentDetails ?? {});
          setNotes(claim.notes ?? "");
          setDocuments(
            (claim.documents ?? []).map(
              (doc: { id: number; slotKey: string | null; originalName: string }) => doc,
            ),
          );
          if (claim.claimType === "DEATH" || claim.claimType === "TOTAL_PERMANENT_DISABILITY") {
            setSubjectName(details.subjectName ?? "");
            setRelationship(details.relationship ?? "");
            setDateOfEvent(details.dateOfEvent?.slice(0, 10) ?? "");
            setCause(details.cause ?? "");
          } else if (claim.claimType === "CRITICAL_ILLNESS") {
            setDiagnosisDate(details.diagnosisDate?.slice(0, 10) ?? "");
            setDiagnosingHospital(details.diagnosingHospital ?? "");
            setDiagnosingPhysician(details.diagnosingPhysician ?? "");
            setIllness(details.illness ?? "");
            setIllnessOther(details.illnessOther ?? "");
          } else if (claim.claimType === "HOSPITALIZATION") {
            setHospitalName(details.hospitalName ?? "");
            setAdmissionDate(details.admissionDate?.slice(0, 10) ?? "");
            setDischargeDate(details.dischargeDate?.slice(0, 10) ?? "");
            setReason(details.reason ?? "");
          }
        }
      } catch (caught: unknown) {
        setError(getApiError(caught)?.message || "Your details could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [resubmitId]);

  useEffect(() => {
    if (claimType !== "DEATH" && claimType !== "TOTAL_PERMANENT_DISABILITY") return;
    setSubjectName(
      (current) =>
        current ||
        (claimantType === "SPOUSE" ? (profile?.spouse?.fullName ?? "") : (profile?.fullName ?? "")),
    );
    setRelationship((current) => current || (claimantType === "SPOUSE" ? "Spouse" : "Self"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimType, claimantType, profile]);

  const illnesses =
    benefitPlan?.benefits.find((item) => item.type === "CRITICAL_ILLNESS" && item.enabled)
      ?.namedConditions ?? [];
  const claimLabel = CLAIM_TYPES.find((item) => item.value === claimType)?.label ?? "Claim";
  const nights =
    admissionDate && dischargeDate ? nightsBetween(admissionDate, dischargeDate) : null;
  const nightsEligible = nights === null || nights >= HOSPITALIZATION_MINIMUM_NIGHTS;
  const uploadedSlotKeys = new Set(
    documents.map((doc) => doc.slotKey).filter((key): key is string => Boolean(key)),
  );
  const documentsComplete = claimType ? hasRequiredDocuments(claimType, uploadedSlotKeys) : false;
  const updateContact = (field: keyof ContactDetails, value: string) =>
    setContact((current) => ({ ...current, [field]: value }));
  const updatePayment = (field: string, value: string) =>
    setPaymentDetails((current) => ({ ...current, [field]: value }));

  const setCoveredPerson = (value: "MEMBER" | "SPOUSE") => {
    setClaimantType(value);
    const spouseCard = formatGhanaCardIdInput(profile?.spouse?.ghanaCardId ?? "");
    setClaimantIdNumber(value === "SPOUSE" ? spouseCard : "");
  };

  const selectClaimType = (type: ClaimType) => {
    setClaimType(type);
    setDocuments([]);
    setDocError("");
    setSubjectName("");
    setRelationship("");
    setDateOfEvent("");
    setCause("");
    setDiagnosisDate("");
    setDiagnosingHospital("");
    setDiagnosingPhysician("");
    setIllness("");
    setIllnessOther("");
    setHospitalName("");
    setAdmissionDate("");
    setDischargeDate("");
    setReason("");
    setCoveredPerson(claimSupportsSpouse(type) && profile?.spouse ? "SPOUSE" : "MEMBER");
  };

  const uploadEndpoint = "/member-portal/claims/documents";
  const uploadDocument = async (slotKey: string, file: File) => {
    setUploadingSlot(slotKey);
    setDocError("");
    const body = new FormData();
    body.append("file", file);
    body.append("slotKey", slotKey);
    try {
      const response = await api.post(uploadEndpoint, body);
      setDocuments((current) => [
        ...current,
        {
          id: response.data.data.id,
          slotKey: response.data.data.slotKey,
          originalName: response.data.data.originalName,
        },
      ]);
    } catch (caught: unknown) {
      setDocError(getApiError(caught)?.message || "Document upload failed.");
    } finally {
      setUploadingSlot(null);
    }
  };
  const removeDocument = async (file: UploadedClaimDocument) => {
    try {
      await api.delete(`/member-portal/claims/documents/${file.id}`);
      setDocuments((current) => current.filter((item) => item.id !== file.id));
    } catch (caught: unknown) {
      setDocError(getApiError(caught)?.message || "The document could not be removed.");
    }
  };

  const buildClaimDetails = () => {
    if (claimType === "DEATH" || claimType === "TOTAL_PERMANENT_DISABILITY")
      return { subjectName, relationship, dateOfEvent, cause };
    if (claimType === "CRITICAL_ILLNESS")
      return {
        diagnosisDate,
        diagnosingHospital,
        diagnosingPhysician,
        illness,
        illnessOther: illness === "Others" ? illnessOther : undefined,
      };
    return { hospitalName, admissionDate, dischargeDate, reason };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!declaration || !claimType || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const payload = {
      claimType,
      claimDetails: buildClaimDetails(),
      claimantType,
      claimantIdType,
      claimantIdNumber,
      claimantContact: contact,
      paymentMethod,
      paymentDetails,
      documentIds: documents.map((file) => file.id),
      notes,
    };
    try {
      if (resubmitId) await api.patch(`/member-portal/claims/${resubmitId}/resubmit`, payload);
      else
        await api.post("/member-portal/claims", payload, {
          headers: { "Idempotency-Key": submissionKey.current },
        });
      navigate("/member/claims", {
        replace: true,
        state: { success: "Your claim was submitted and is awaiting staff review." },
      });
    } catch (caught: unknown) {
      const issues = getApiError(caught)?.errors as Array<{ message?: string }> | undefined;
      setError(
        issues
          ?.map((issue) => issue.message)
          .filter(Boolean)
          .join(" ") ||
          getApiError(caught)?.message ||
          "The claim could not be submitted.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const leave = () => {
    if (window.confirm("Leave this claim? Information entered here will be lost."))
      navigate("/member/claims");
  };
  const page0Complete =
    Boolean(claimType) &&
    nightsEligible &&
    documentsComplete &&
    claimantIdNumber.trim().length >= 3 &&
    (!claimType || !claimSupportsSpouse(claimType) || Boolean(profile?.spouse));
  // Death/TPD with no spouse on file can never be submitted -- rather than render the rest of the
  // form (subject details, ID, documents) behind a Next button that's disabled for a reason the
  // member can't see, hide those sections entirely and leave only the claim-type cards and the
  // explanation visible.
  const blockedNoSpouse = Boolean(claimType && claimSupportsSpouse(claimType) && !profile?.spouse);

  if (loading)
    return (
      <div className="mx-auto max-w-295 py-12 text-center text-sm text-text-muted">Loading…</div>
    );

  return (
    <div className="mx-auto max-w-295 pb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={leave}
          className="text-xs font-bold text-text-muted hover:text-text-strong"
        >
          ← Back to claims
        </button>
        <span className="text-xs font-semibold text-text-muted">
          Step {page + 1} of {PAGE_LABELS.length}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
        <main className="overflow-hidden rounded-xl border border-border-default bg-(--surface-raised) shadow-panel">
          <header className="border-b border-border-strong px-5 py-5 sm:px-7">
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold text-text-strong">
              {resubmitId ? "Edit and resubmit your claim" : "File a claim"}
            </h1>
            <p className="mt-1 text-xs text-text-muted">{PAGE_LABELS[page]}</p>
          </header>
          <div className="p-5 sm:p-7">
            <p className="mb-5 text-xs font-semibold text-text-muted">
              Fields marked <span className="text-danger">*</span> are required. Submitted claims
              are reviewed by staff before they're sent for processing.
            </p>
            {error && (
              <div className="mb-5">
                <Alert tone="error">{error}</Alert>
              </div>
            )}

            {page === 0 && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setError("");
                  if (page0Complete) setPage(1);
                }}
              >
                <SectionTitle>Member on record</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ReadOnlyField label="Policy holder" value={profile?.fullName ?? ""} />
                  <ReadOnlyField label="Staff ID" value={profile?.controllerId ?? ""} />
                  <ReadOnlyField
                    label="District"
                    value={profile?.district?.name ?? "Not assigned"}
                  />
                  <ReadOnlyField
                    label="Region"
                    value={profile?.district?.region.name ?? "Not assigned"}
                  />
                </div>

                <div className="mt-7">
                  <SectionTitle>1. Select claim type</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {CLAIM_TYPES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={claimType === item.value}
                        onClick={() => selectClaimType(item.value)}
                        className={`rounded-xl border-1.5 p-4 text-left transition-[border-color,background-color] ${claimType === item.value ? "border-action-primary bg-info-soft shadow-selected" : "border-border-default bg-(--surface-raised) hover:border-action-primary"}`}
                      >
                        <div className="text-base font-extrabold text-text-strong">
                          {item.label}
                        </div>
                        {/* CLAIM_TYPES' "coverage" text is shared with the staff wizard, where "Member &
                      Spouse" is accurate -- on the member portal, Death/TPD are locked to
                      spouse-only (a member can't be the one logging in to claim their own death),
                      so it's overridden here to avoid contradicting the restriction below. */}
                        <div className="mt-1 text-xs text-text-muted">
                          {claimSupportsSpouse(item.value) ? "Spouse only" : item.coverage}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {claimType && (
                  <>
                    {claimSupportsSpouse(claimType) && (
                      <div className="mt-7">
                        <SectionTitle>Who is this claim for?</SectionTitle>
                        {profile?.spouse ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <label
                              className={`flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${claimantType === "SPOUSE" ? "border-action-primary bg-info-soft text-text-strong" : "border-border-default text-ink"}`}
                            >
                              <input
                                type="radio"
                                name="claimantType"
                                checked={claimantType === "SPOUSE"}
                                onChange={() => setCoveredPerson("SPOUSE")}
                                className="size-4 accent-action-primary"
                              />
                              For my spouse — {profile.spouse.fullName}
                            </label>
                          </div>
                        ) : (
                          <Alert tone="warning">
                            This claim type must be filed by a spouse. Add a spouse to your profile
                            before filing a Death or Total & Permanent Disability claim.
                          </Alert>
                        )}
                      </div>
                    )}

                    {!blockedNoSpouse && (
                      <>
                        {(claimType === "DEATH" || claimType === "TOTAL_PERMANENT_DISABILITY") && (
                          <DeathDisabilitySection
                            claimType={claimType}
                            subjectName={subjectName}
                            relationship={relationship}
                            dateOfEvent={dateOfEvent}
                            cause={cause}
                            setSubjectName={setSubjectName}
                            setRelationship={setRelationship}
                            setDateOfEvent={setDateOfEvent}
                            setCause={setCause}
                          />
                        )}

                        {claimType === "CRITICAL_ILLNESS" && (
                          <CriticalIllnessSection
                            diagnosisDate={diagnosisDate}
                            diagnosingHospital={diagnosingHospital}
                            diagnosingPhysician={diagnosingPhysician}
                            illness={illness}
                            illnessOther={illnessOther}
                            illnesses={illnesses}
                            setDiagnosisDate={setDiagnosisDate}
                            setDiagnosingHospital={setDiagnosingHospital}
                            setDiagnosingPhysician={setDiagnosingPhysician}
                            setIllness={setIllness}
                            setIllnessOther={setIllnessOther}
                          />
                        )}

                        {claimType === "HOSPITALIZATION" && (
                          <HospitalizationSection
                            hospitalName={hospitalName}
                            admissionDate={admissionDate}
                            dischargeDate={dischargeDate}
                            reason={reason}
                            nights={nights}
                            nightsEligible={nightsEligible}
                            setHospitalName={setHospitalName}
                            setAdmissionDate={setAdmissionDate}
                            setDischargeDate={setDischargeDate}
                            setReason={setReason}
                          />
                        )}

                        <div className="mt-7">
                          <SectionTitle>Mode of identification</SectionTitle>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <ReadOnlyField label="Claimant ID type" value="Ghana Card" />
                            <InputField
                              label="Ghana Card number"
                              required
                              hint="Required to continue. Use the format GHA-000000000-0."
                              value={claimantIdNumber}
                              onChange={(event) => setClaimantIdNumber(event.target.value)}
                              placeholder="GHA-000000000-0"
                            />
                          </div>
                        </div>

                        <div className="mt-7">
                          <SectionTitle>Documents you're presenting</SectionTitle>
                          <ClaimDocumentChecklist
                            claimType={claimType}
                            documents={documents}
                            uploadingSlot={uploadingSlot}
                            error={docError}
                            onUpload={uploadDocument}
                            onRemove={removeDocument}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                <div className="mt-7 rounded-lg bg-surface-subtle p-4">
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={leave}>
                      Cancel
                    </Button>
                    {!blockedNoSpouse && (
                      <Button type="submit" disabled={!page0Complete}>
                        Next
                      </Button>
                    )}
                  </div>
                </div>
                <Progress labels={PAGE_LABELS} page={page} />
              </form>
            )}

            {page === 1 && (
              <form onSubmit={submit}>
                <ClaimPaymentSection
                  source="MEMBER_PORTAL"
                  paymentDetails={paymentDetails}
                  contact={contact}
                  declaration={declaration}
                  notes={notes}
                  updatePayment={updatePayment}
                  updateContact={updateContact}
                  setDeclaration={setDeclaration}
                  setNotes={setNotes}
                />
                <div className="mt-7 flex flex-col-reverse gap-2 rounded-lg bg-surface-subtle p-4 sm:flex-row sm:justify-between">
                  <Button variant="secondary" onClick={() => setPage(0)}>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    loading={busy}
                    loadingLabel="Submitting claim..."
                    disabled={!declaration}
                  >
                    {resubmitId ? "Resubmit claim" : "Submit claim"}
                  </Button>
                </div>
                <Progress labels={PAGE_LABELS} page={page} />
              </form>
            )}
          </div>
        </main>

        <aside className="rounded-xl border border-border-default bg-(--surface-raised) p-5 shadow-panel">
          <h2 className="mb-3 text-lg font-extrabold text-text-strong">Claim summary</h2>
          <dl className="space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-border-default pb-2">
              <dt className="text-text-muted">Claim type</dt>
              <dd className="font-semibold text-ink">{claimType ? claimLabel : "Not selected"}</dd>
            </div>
            <div className="flex justify-between border-b border-border-default pb-2">
              <dt className="text-text-muted">Filing for</dt>
              <dd className="font-semibold text-ink">
                {claimantType === "SPOUSE" ? "Spouse" : "Me"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Member</dt>
              <dd className="font-semibold text-ink">{profile?.fullName ?? "—"}</dd>
            </div>
          </dl>
          {claimType && (
            <div className="mt-3 rounded-lg bg-surface-subtle px-3 py-2 text-xs font-bold text-text-strong">
              {documents.length} document{documents.length === 1 ? "" : "s"} attached
            </div>
          )}
          <p className="mt-4 text-xs leading-relaxed text-text-muted">
            Your claim will be reviewed by a staff member before it is sent to the insurer for
            processing.
          </p>
        </aside>
      </div>
    </div>
  );
}
