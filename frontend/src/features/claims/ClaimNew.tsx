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
import { formatCurrency } from "@/lib/currency";
import { getApiError } from "@/lib/errorExtract";
import { applyGhanaCardIdChange, formatGhanaCardIdInput } from "@/lib/ghanaCardId";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

type MemberLookup = {
  id: number;
  controllerId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  ghanaCardId: string | null;
  school: string;
  status: string;
  district: {
    id: number;
    name: string;
    region: { id: number; name: string };
  } | null;
  spouse: { id: number; fullName: string; ghanaCardId: string | null } | null;
};

const PAGE_LABELS = ["Policy and identification", "Payment and declaration"];

export default function ClaimNew() {
  const navigate = useNavigate();
  const submissionKey = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState(-1);
  const [staffId, setStaffId] = useState("");
  const [member, setMember] = useState<MemberLookup | null>(null);
  const [claimType, setClaimType] = useState<ClaimType | "">("");
  const [claimantType, setClaimantType] = useState<"MEMBER" | "SPOUSE">("MEMBER");
  const claimantIdType = "GHANA_CARD";
  const [claimantIdNumber, setClaimantIdNumber] = useState("");
  const [estimate, setEstimate] = useState<{
    amount: string | null;
    available: boolean;
    note: string | null;
  } | null>(null);
  const [documents, setDocuments] = useState<UploadedClaimDocument[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [docError, setDocError] = useState("");

  // Death / Total & Permanent Disability
  const [subjectName, setSubjectName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [dateOfEvent, setDateOfEvent] = useState("");
  const [cause, setCause] = useState("");

  // Critical illness
  const [diagnosisDate, setDiagnosisDate] = useState("");
  const [diagnosingHospital, setDiagnosingHospital] = useState("");
  const [diagnosingPhysician, setDiagnosingPhysician] = useState("");
  const [illnesses, setIllnesses] = useState<string[]>([]);
  const [illness, setIllness] = useState("");
  const [illnessOther, setIllnessOther] = useState("");

  // Hospitalization
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
  // Mode of payment is always cheque in practice, so this isn't a user choice -- keeping it as a
  // named constant (rather than inlining "CHEQUE" everywhere below) documents that intent and
  // keeps the submit payload/paymentComplete check unchanged in shape.
  const paymentMethod = "CHEQUE";
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = Boolean(member);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (page >= 0) {
      headingRef.current?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [page]);
  useEffect(() => {
    if (claimType !== "CRITICAL_ILLNESS") return;
    api
      .get("/claims/illnesses")
      .then((response) => setIllnesses(response.data.data.illnesses))
      .catch(() => setIllnesses([]));
  }, [claimType]);
  useEffect(() => {
    if (claimType !== "DEATH" && claimType !== "TOTAL_PERMANENT_DISABILITY") return;
    setSubjectName(
      claimantType === "SPOUSE" ? (member?.spouse?.fullName ?? "") : (member?.fullName ?? ""),
    );
    setRelationship(claimantType === "SPOUSE" ? "Spouse" : "Self");
  }, [claimType, claimantType, member]);

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
    setEstimate(null);
    const selected = value === "SPOUSE" ? member?.spouse : member;
    setClaimantIdNumber(formatGhanaCardIdInput(selected?.ghanaCardId ?? ""));
    setContact({
      fullName: selected?.fullName ?? "",
      primaryPhone: value === "MEMBER" ? (member?.phone ?? "") : "",
      additionalPhone: "",
      email: value === "MEMBER" ? (member?.email ?? "") : "",
      gpsAddress: "",
      residentialAddress: "",
      nationality: "Ghanaian",
    });
  };

  const selectClaimType = (type: ClaimType) => {
    setClaimType(type);
    setEstimate(null);
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
    setCoveredPerson(claimSupportsSpouse(type) ? claimantType : "MEMBER");
  };

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api.get("/claims/member-lookup", {
        params: { staffId: staffId.trim() },
      });
      const found = response.data.data as MemberLookup;
      setMember(found);
      setClaimantType("MEMBER");
      setClaimantIdNumber(formatGhanaCardIdInput(found.ghanaCardId ?? ""));
      setContact({
        fullName: found.fullName,
        primaryPhone: found.phone ?? "",
        additionalPhone: "",
        email: found.email ?? "",
        gpsAddress: "",
        residentialAddress: "",
        nationality: "Ghanaian",
      });
      setPage(0);
    } catch (caught: unknown) {
      setError(getApiError(caught)?.message || "We could not find that member.");
    } finally {
      setBusy(false);
    }
  };

  const getEstimate = async () => {
    if (!member || !claimType) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.get("/claims/estimate", {
        params: { memberId: member.id, claimType, claimantType },
      });
      setEstimate(response.data.data);
    } catch (caught: unknown) {
      setError(getApiError(caught)?.message || "The estimate could not be calculated.");
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async (slotKey: string, file: File) => {
    if (!member) return;
    setUploadingSlot(slotKey);
    setDocError("");
    const body = new FormData();
    body.append("file", file);
    body.append("category", "CLAIM_DOCUMENT");
    body.append("slotKey", slotKey);
    try {
      const response = await api.post(`/members/${member.id}/files`, body);
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
      await api.delete(`/files/${file.id}`);
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
    if (!member || !declaration || !claimType || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api.post(
        "/claims/submissions",
        {
          memberId: member.id,
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
        },
        { headers: { "Idempotency-Key": submissionKey.current } },
      );
      if (response.data.data.deliveryState !== "ACCEPTED") {
        navigate(`/claims/${response.data.data.id}`, { replace: true });
        return;
      }
      navigate("/claims", {
        replace: true,
        state: {
          success: `Claim ${response.data.data.externalClaimId} was submitted successfully.`,
        },
      });
    } catch (caught: unknown) {
      const issues = getApiError(caught)?.errors as Array<{ message?: string }> | undefined;
      setError(
        issues
          ?.map((issue) => issue.message)
          .filter(Boolean)
          .join(" ") ||
          getApiError(caught)?.message ||
          "The submission outcome is unknown. Check claim history before starting another claim.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const leave = () => {
    if (!dirty || window.confirm("Leave this claim? Information entered here will be lost."))
      navigate("/claims");
  };
  const page0Complete =
    Boolean(claimType) &&
    nightsEligible &&
    documentsComplete &&
    claimantIdNumber.trim().length >= 3;

  if (page === -1)
    return (
      <div className="-mx-4 -my-5 grid min-h-[calc(100vh-74px)] place-items-center bg-app-bg px-4 py-10 sm:-mx-7 sm:-my-6">
        <section
          className="w-full max-w-md rounded-xl border border-border-default bg-(--surface-raised) p-6 shadow-control sm:p-7"
          aria-labelledby="claim-lookup-heading"
        >
          <button
            type="button"
            onClick={() => navigate("/claims")}
            className="mb-5 text-xs font-bold text-text-muted hover:text-text-strong"
          >
            ← Back to claims
          </button>
          <h1 id="claim-lookup-heading" className="text-2xl font-extrabold text-text-strong">
            File a claim
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            Find the policy holder before entering claim information.
          </p>
          <div className="my-5 rounded-lg bg-brand-navy px-4 py-3 text-sm font-semibold text-text-on-action">
            Provide the member's Staff ID to continue.
          </div>
          {error && (
            <div className="mb-4">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <form onSubmit={lookup}>
            <InputField
              label="Staff ID"
              required
              autoFocus
              value={staffId}
              onChange={(event) => {
                setStaffId(event.target.value);
                setError("");
              }}
              placeholder="Enter Staff ID"
            />
            <Button
              type="submit"
              loading={busy}
              loadingLabel="Finding member..."
              disabled={!staffId.trim()}
              className="mt-5"
            >
              Continue
            </Button>
          </form>
        </section>
      </div>
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
              File a claim
            </h1>
            <p className="mt-1 text-xs text-text-muted">{PAGE_LABELS[page]}</p>
          </header>
          <div className="p-5 sm:p-7">
            <div
              className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-info-border bg-info-soft px-4 py-3 text-sm text-text-strong"
              role="status"
            >
              <span
                aria-hidden="true"
                className="grid size-5 place-items-center rounded-full bg-brand-navy text-xs font-bold text-text-on-action"
              >
                i
              </span>
              <strong>{claimType ? claimLabel : "New claim"}</strong>
              <span>for Staff ID {member?.controllerId}</span>
              <span className="font-bold text-success">[{member?.status}]</span>
            </div>
            <p className="mb-5 text-xs font-semibold text-text-muted">
              Fields marked <span className="text-danger">*</span> are required.
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
                  <ReadOnlyField label="Policy holder" value={member?.fullName ?? ""} />
                  <ReadOnlyField
                    label="Staff ID / policy number"
                    value={`${member?.controllerId} [${member?.status}]`}
                  />
                  <ReadOnlyField
                    label="District"
                    value={member?.district?.name ?? "Not assigned"}
                  />
                  <ReadOnlyField
                    label="Region"
                    value={member?.district?.region.name ?? "Not assigned"}
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
                        <div className="mt-1 text-xs text-text-muted">{item.coverage}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {claimType && (
                  <>
                    {claimSupportsSpouse(claimType) && (
                      <div className="mt-7">
                        <SectionTitle>Who is this claim for?</SectionTitle>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <label
                            className={`flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold ${claimantType === "MEMBER" ? "border-action-primary bg-info-soft text-text-strong" : "border-border-default text-ink"}`}
                          >
                            <input
                              type="radio"
                              name="claimantType"
                              checked={claimantType === "MEMBER"}
                              onChange={() => setCoveredPerson("MEMBER")}
                              className="size-4 accent-action-primary"
                            />
                            For member — {member?.fullName}
                          </label>
                          {member?.spouse && (
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
                              For spouse — {member.spouse.fullName}
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-7 flex flex-col gap-3 rounded-lg border border-border-default bg-surface-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold text-text-strong">
                          Estimated claim amount{" "}
                          <span className="font-normal text-text-muted">(optional)</span>
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          You can continue without calculating an estimate.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        loading={busy}
                        loadingLabel="Calculating..."
                        onClick={getEstimate}
                        className="w-full sm:w-auto"
                      >
                        Calculate estimate
                      </Button>
                    </div>
                    {estimate && (
                      <div className="mt-4 rounded-lg border border-success-border bg-success-soft px-4 py-3">
                        <span className="text-xs font-bold uppercase tracking-wide text-success">
                          Estimated benefit
                        </span>
                        <strong className="ml-3 text-lg text-text-strong">
                          {estimate.available ? formatCurrency(estimate.amount) : "Not configured"}
                        </strong>
                        <p className="mt-1 text-xs text-text-muted">
                          {estimate.available
                            ? "Calculated from the active benefit plan. Final assessment may differ."
                            : "No benefit amount is configured for this selection."}
                        </p>
                      </div>
                    )}

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
                          onChange={(event) => setClaimantIdNumber(applyGhanaCardIdChange(event))}
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

                <div className="mt-7 rounded-lg bg-surface-subtle p-4">
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMember(null);
                        setPage(-1);
                      }}
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={!page0Complete}>
                      Next
                    </Button>
                  </div>
                </div>
                <Progress labels={PAGE_LABELS} page={page} />
              </form>
            )}

            {page === 1 && (
              <form onSubmit={submit}>
                <ClaimPaymentSection
                  source="STAFF"
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
                    Submit claim
                  </Button>
                </div>
                <Progress labels={PAGE_LABELS} page={page} />
              </form>
            )}
          </div>
        </main>

        <aside className="rounded-xl border border-border-default bg-(--surface-raised) p-5 shadow-panel">
          <h2 className="mb-3 text-lg font-extrabold text-text-strong">Benefit summary</h2>
          <dl className="space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-border-default pb-2">
              <dt className="text-text-muted">Claim type</dt>
              <dd className="font-semibold text-ink">{claimType ? claimLabel : "Not selected"}</dd>
            </div>
            <div className="flex justify-between border-b border-border-default pb-2">
              <dt className="text-text-muted">Filing for</dt>
              <dd className="font-semibold text-ink">
                {claimantType === "SPOUSE" ? "Spouse" : "Member"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-border-default pb-2">
              <dt className="text-text-muted">Estimated benefit</dt>
              <dd className="font-semibold text-success">
                {estimate?.available ? formatCurrency(estimate.amount) : "Not calculated"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-border-default pb-2">
              <dt className="text-text-muted">Member</dt>
              <dd className="font-semibold text-ink">{member?.fullName ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">District</dt>
              <dd className="font-semibold text-ink">{member?.district?.name ?? "Not assigned"}</dd>
            </div>
          </dl>
          {claimType && (
            <div className="mt-3 rounded-lg bg-surface-subtle px-3 py-2 text-xs font-bold text-text-strong">
              {documents.length} document{documents.length === 1 ? "" : "s"} attached
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
