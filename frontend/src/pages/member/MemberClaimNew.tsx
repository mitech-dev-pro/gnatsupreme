import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { CLAIM_TYPES, claimSupportsSpouse, hasRequiredDocuments, HOSPITALIZATION_MINIMUM_NIGHTS, nightsBetween, type ClaimType } from "@/lib/claimDocuments";
import Button from "@/components/ui/Button";
import { InputField, SelectField, TextareaField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import ClaimDocumentChecklist, { type UploadedClaimDocument } from "@/components/claims/ClaimDocumentChecklist";

type Profile = {
  id: number;
  controllerId: string;
  fullName: string;
  phone: string | null;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
  spouse: { fullName: string; ghanaCardId: string | null } | null;
};

type BenefitPlan = { benefits: { type: string; enabled: boolean; namedConditions: string[] }[] } | null;
type ContactDetails = { fullName: string; primaryPhone: string; additionalPhone: string; email: string; gpsAddress: string; residentialAddress: string; nationality: string };

const PAGE_LABELS = ["Claim details", "Claimant information", "Payment and declaration"];

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 bg-(--surface-subtle) px-3 py-2 text-[15px] font-extrabold text-(--text-strong)">{children}</h2>;
}
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><div className="mb-1.5 text-[11.5px] font-bold text-(--text-strong)">{label}</div><div className="min-h-10 rounded-[9px] border border-(--border-default) bg-(--surface-subtle) px-3 py-2.5 text-[12.5px] font-semibold text-(--ink)">{value}</div></div>;
}
function Progress({ page }: { page: number }) {
  return <div className="flex justify-center gap-2 py-5" aria-label={`Step ${page + 1} of 3`}>{PAGE_LABELS.map((label, index) => <span key={label} title={label} className={`h-2.5 rounded-full transition-[width,background-color] duration-200 ${index === page ? "w-8 bg-(--action-primary)" : index < page ? "w-2.5 bg-(--success)" : "w-2.5 bg-(--border-strong)"}`}/>)}</div>;
}

export default function MemberClaimNew() {
  const navigate = useNavigate();
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

  const [contact, setContact] = useState<ContactDetails>({ fullName: "", primaryPhone: "", additionalPhone: "", email: "", gpsAddress: "", residentialAddress: "", nationality: "Ghanaian" });
  const [paymentMethod, setPaymentMethod] = useState("MOBILE_MONEY");
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { headingRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }, [page]);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get("/member-portal/profile");
        const found = response.data.data.member as Profile;
        setProfile(found);
        setBenefitPlan(response.data.data.benefitPlan);
        setContact({ fullName: found.fullName, primaryPhone: found.phone ?? "", additionalPhone: "", email: "", gpsAddress: "", residentialAddress: "", nationality: "Ghanaian" });

        if (resubmitId) {
          const claimResponse = await api.get(`/member-portal/claims/${resubmitId}`);
          const claim = claimResponse.data.data;
          const details = claim.claimDetails ?? {};
          setClaimType(claim.claimType);
          setClaimantType(claim.claimantType ?? "MEMBER");
          setClaimantIdNumber(claim.claimantIdNumber ?? "");
          if (claim.claimantContact) setContact(claim.claimantContact);
          setPaymentMethod(claim.paymentMethod ?? "MOBILE_MONEY");
          setPaymentDetails(claim.paymentDetails ?? {});
          setNotes(claim.notes ?? "");
          setDocuments((claim.documents ?? []).map((doc: { id: number; slotKey: string | null; originalName: string }) => doc));
          if (claim.claimType === "DEATH" || claim.claimType === "TOTAL_PERMANENT_DISABILITY") {
            setSubjectName(details.subjectName ?? ""); setRelationship(details.relationship ?? ""); setDateOfEvent(details.dateOfEvent?.slice(0, 10) ?? ""); setCause(details.cause ?? "");
          } else if (claim.claimType === "CRITICAL_ILLNESS") {
            setDiagnosisDate(details.diagnosisDate?.slice(0, 10) ?? ""); setDiagnosingHospital(details.diagnosingHospital ?? ""); setDiagnosingPhysician(details.diagnosingPhysician ?? ""); setIllness(details.illness ?? ""); setIllnessOther(details.illnessOther ?? "");
          } else if (claim.claimType === "HOSPITALIZATION") {
            setHospitalName(details.hospitalName ?? ""); setAdmissionDate(details.admissionDate?.slice(0, 10) ?? ""); setDischargeDate(details.dischargeDate?.slice(0, 10) ?? ""); setReason(details.reason ?? "");
          }
        }
      } catch (caught: any) {
        setError(caught?.response?.data?.message || "Your details could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, [resubmitId]);

  useEffect(() => {
    if (claimType !== "DEATH" && claimType !== "TOTAL_PERMANENT_DISABILITY") return;
    setSubjectName((current) => current || (claimantType === "SPOUSE" ? profile?.spouse?.fullName ?? "" : profile?.fullName ?? ""));
    setRelationship((current) => current || (claimantType === "SPOUSE" ? "Spouse" : "Self"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimType, claimantType, profile]);

  const illnesses = benefitPlan?.benefits.find((item) => item.type === "CRITICAL_ILLNESS" && item.enabled)?.namedConditions ?? [];
  const claimLabel = CLAIM_TYPES.find((item) => item.value === claimType)?.label ?? "Claim";
  const nights = admissionDate && dischargeDate ? nightsBetween(admissionDate, dischargeDate) : null;
  const nightsEligible = nights === null || nights >= HOSPITALIZATION_MINIMUM_NIGHTS;
  const uploadedSlotKeys = new Set(documents.map((doc) => doc.slotKey).filter((key): key is string => Boolean(key)));
  const documentsComplete = claimType ? hasRequiredDocuments(claimType, uploadedSlotKeys) : false;
  const updateContact = (field: keyof ContactDetails, value: string) => setContact((current) => ({ ...current, [field]: value }));
  const updatePayment = (field: string, value: string) => setPaymentDetails((current) => ({ ...current, [field]: value }));

  const setCoveredPerson = (value: "MEMBER" | "SPOUSE") => {
    setClaimantType(value);
    const spouseCard = profile?.spouse?.ghanaCardId ?? "";
    setClaimantIdNumber(value === "SPOUSE" ? spouseCard : "");
  };

  const selectClaimType = (type: ClaimType) => {
    setClaimType(type); setDocuments([]); setDocError("");
    setSubjectName(""); setRelationship(""); setDateOfEvent(""); setCause("");
    setDiagnosisDate(""); setDiagnosingHospital(""); setDiagnosingPhysician(""); setIllness(""); setIllnessOther("");
    setHospitalName(""); setAdmissionDate(""); setDischargeDate(""); setReason("");
    setCoveredPerson(claimSupportsSpouse(type) ? claimantType : "MEMBER");
  };

  const uploadEndpoint = "/member-portal/claims/documents";
  const uploadDocument = async (slotKey: string, file: File) => {
    setUploadingSlot(slotKey); setDocError("");
    const body = new FormData(); body.append("file", file); body.append("slotKey", slotKey);
    try {
      const response = await api.post(uploadEndpoint, body);
      setDocuments((current) => [...current, { id: response.data.data.id, slotKey: response.data.data.slotKey, originalName: response.data.data.originalName }]);
    } catch (caught: any) { setDocError(caught?.response?.data?.message || "Document upload failed."); }
    finally { setUploadingSlot(null); }
  };
  const removeDocument = async (file: UploadedClaimDocument) => {
    try { await api.delete(`/member-portal/claims/documents/${file.id}`); setDocuments((current) => current.filter((item) => item.id !== file.id)); }
    catch (caught: any) { setDocError(caught?.response?.data?.message || "The document could not be removed."); }
  };

  const buildClaimDetails = () => {
    if (claimType === "DEATH" || claimType === "TOTAL_PERMANENT_DISABILITY") return { subjectName, relationship, dateOfEvent, cause };
    if (claimType === "CRITICAL_ILLNESS") return { diagnosisDate, diagnosingHospital, diagnosingPhysician, illness, illnessOther: illness === "Others" ? illnessOther : undefined };
    return { hospitalName, admissionDate, dischargeDate, reason };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!declaration || !claimType) return; setBusy(true); setError("");
    const payload = { claimType, claimDetails: buildClaimDetails(), claimantType, claimantIdType, claimantIdNumber, claimantContact: contact, paymentMethod, paymentDetails, documentIds: documents.map((file) => file.id), notes };
    try {
      if (resubmitId) await api.patch(`/member-portal/claims/${resubmitId}/resubmit`, payload);
      else await api.post("/member-portal/claims", payload);
      navigate("/member/claims", { replace: true, state: { success: "Your claim was submitted and is awaiting staff review." } });
    } catch (caught: any) {
      const issues = caught?.response?.data?.errors as Array<{ message?: string }> | undefined;
      setError(issues?.map((issue) => issue.message).filter(Boolean).join(" ") || caught?.response?.data?.message || "The claim could not be submitted.");
    } finally { setBusy(false); }
  };

  const leave = () => { if (window.confirm("Leave this claim? Information entered here will be lost.")) navigate("/member/claims"); };
  const paymentComplete = paymentMethod === "NO_PAYMENT" || (paymentMethod === "MOBILE_MONEY" && paymentDetails.network && paymentDetails.mobileNumber && paymentDetails.accountName) || (paymentMethod === "BANK_ACCOUNT" && paymentDetails.bankName && paymentDetails.accountNumber && paymentDetails.accountName) || (paymentMethod === "CHEQUE" && paymentDetails.payeeName);
  const page0Complete = Boolean(claimType) && nightsEligible && documentsComplete && claimantIdNumber.trim().length >= 3;

  if (loading) return <div className="mx-auto max-w-[1180px] py-12 text-center text-[12.5px] text-(--text-muted)">Loading…</div>;

  return <div className="mx-auto max-w-[1180px] pb-6">
    <div className="mb-4 flex items-center justify-between gap-3"><button type="button" onClick={leave} className="text-[11.5px] font-bold text-(--text-muted) hover:text-(--text-strong)">← Back to claims</button><span className="text-[11px] font-semibold text-(--text-muted)">Step {page + 1} of 3</span></div>
    <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
    <main className="overflow-hidden rounded-[12px] border border-(--border-default) bg-(--surface-raised) shadow-[0_2px_6px_rgba(30,39,97,0.08)]">
      <header className="border-b border-(--border-strong) px-5 py-5 sm:px-7"><h1 ref={headingRef} tabIndex={-1} className="text-[22px] font-extrabold text-(--text-strong)">{resubmitId ? "Edit and resubmit your claim" : "File a claim"}</h1><p className="mt-1 text-[12px] text-(--text-muted)">{PAGE_LABELS[page]}</p></header>
      <div className="p-5 sm:p-7">
        <p className="mb-5 text-[12px] font-semibold text-(--text-muted)">Fields marked <span className="text-(--danger)">*</span> are required. Submitted claims are reviewed by staff before they're sent for processing.</p>
        {error && <div className="mb-5"><Alert tone="error">{error}</Alert></div>}

        {page === 0 && <form onSubmit={(event) => { event.preventDefault(); setError(""); if (page0Complete) setPage(1); }}>
          <SectionTitle>Member on record</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2"><ReadOnlyField label="Policy holder" value={profile?.fullName ?? ""}/><ReadOnlyField label="Staff ID" value={profile?.controllerId ?? ""}/><ReadOnlyField label="District" value={profile?.district?.name ?? "Not assigned"}/><ReadOnlyField label="Region" value={profile?.district?.region.name ?? "Not assigned"}/></div>

          <div className="mt-7"><SectionTitle>1. Select claim type</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CLAIM_TYPES.map((item) => (
                <button key={item.value} type="button" aria-pressed={claimType === item.value} onClick={() => selectClaimType(item.value)} className={`rounded-[12px] border-1.5 p-4 text-left transition-[border-color,background-color] ${claimType === item.value ? "border-(--action-primary) bg-(--info-soft) shadow-[0_0_0_3px_rgba(31,156,124,0.14)]" : "border-(--border-default) bg-(--surface-raised) hover:border-(--action-primary)"}`}>
                  <div className="text-[15px] font-extrabold text-(--text-strong)">{item.label}</div>
                  <div className="mt-1 text-[11px] text-(--text-muted)">{item.coverage}</div>
                </button>
              ))}
            </div>
          </div>

          {claimType && <>
            {claimSupportsSpouse(claimType) && <div className="mt-7"><SectionTitle>Who is this claim for?</SectionTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className={`flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold ${claimantType === "MEMBER" ? "border-(--action-primary) bg-(--info-soft) text-(--text-strong)" : "border-(--border-default) text-(--ink)"}`}><input type="radio" name="claimantType" checked={claimantType === "MEMBER"} onChange={() => setCoveredPerson("MEMBER")} className="size-4 accent-(--action-primary)"/>For me</label>
                {profile?.spouse && <label className={`flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border px-3 text-[12.5px] font-semibold ${claimantType === "SPOUSE" ? "border-(--action-primary) bg-(--info-soft) text-(--text-strong)" : "border-(--border-default) text-(--ink)"}`}><input type="radio" name="claimantType" checked={claimantType === "SPOUSE"} onChange={() => setCoveredPerson("SPOUSE")} className="size-4 accent-(--action-primary)"/>For my spouse — {profile.spouse.fullName}</label>}
              </div>
            </div>}

            {(claimType === "DEATH" || claimType === "TOTAL_PERMANENT_DISABILITY") && <div className="mt-7"><SectionTitle>Description of the {claimType === "DEATH" ? "deceased" : "disabled person"}</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2"><InputField label={`Name of ${claimType === "DEATH" ? "deceased" : "disabled person"}`} required value={subjectName} onChange={(event) => setSubjectName(event.target.value)}/><InputField label="Relationship to member" required value={relationship} onChange={(event) => setRelationship(event.target.value)}/></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><InputField label={claimType === "DEATH" ? "Date of death" : "Date of incidence"} type="date" required max={new Date().toISOString().slice(0, 10)} value={dateOfEvent} onChange={(event) => setDateOfEvent(event.target.value)}/><InputField label={claimType === "DEATH" ? "Cause of death" : "Cause of disability"} required value={cause} onChange={(event) => setCause(event.target.value)} placeholder={claimType === "DEATH" ? "e.g. Cardiac arrest" : "e.g. Road traffic accident"}/></div>
            </div>}

            {claimType === "CRITICAL_ILLNESS" && <div className="mt-7"><SectionTitle>Diagnosis details</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2"><InputField label="Date of diagnosis" type="date" required max={new Date().toISOString().slice(0, 10)} value={diagnosisDate} onChange={(event) => setDiagnosisDate(event.target.value)}/><InputField label="Diagnosing hospital" required value={diagnosingHospital} onChange={(event) => setDiagnosingHospital(event.target.value)} placeholder="e.g. Komfo Anokye Teaching Hospital"/></div>
              <div className="mt-4"><InputField label="Diagnosing physician" required value={diagnosingPhysician} onChange={(event) => setDiagnosingPhysician(event.target.value)}/></div>
              <fieldset className="mt-4"><legend className="mb-2 text-[11.5px] font-bold text-(--text-strong)">Named critical illness diagnosed <span className="text-(--danger)">*</span></legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {illnesses.map((item) => <label key={item} className="flex min-h-8 cursor-pointer items-center gap-2 text-[12px] text-(--ink)"><input type="radio" name="illness" checked={illness === item} onChange={() => setIllness(item)} className="size-4 accent-(--action-primary)"/>{item}</label>)}
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-[12px] text-(--ink)"><input type="radio" name="illness" checked={illness === "Others"} onChange={() => setIllness("Others")} className="size-4 accent-(--action-primary)"/>Others (specify)</label>
                </div>
                {illness === "Others" && <div className="mt-2"><InputField label="Specify illness" required value={illnessOther} onChange={(event) => setIllnessOther(event.target.value)} hint="Subject to approval by miLife"/></div>}
              </fieldset>
            </div>}

            {claimType === "HOSPITALIZATION" && <div className="mt-7"><SectionTitle>Hospitalization details</SectionTitle>
              <InputField label="Name of hospital" required value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} placeholder="e.g. Komfo Anokye Teaching Hospital"/>
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><InputField label="Date of admission" type="date" required max={new Date().toISOString().slice(0, 10)} value={admissionDate} onChange={(event) => setAdmissionDate(event.target.value)}/><InputField label="Date of discharge" type="date" required max={new Date().toISOString().slice(0, 10)} value={dischargeDate} onChange={(event) => setDischargeDate(event.target.value)}/></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><ReadOnlyField label="Number of nights admitted" value={nights === null ? "—" : `${nights} ${nights === 1 ? "night" : "nights"}`}/><InputField label="Reason for hospitalization / diagnosis" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Malaria complications"/></div>
              {nights !== null && <div className={`mt-4 flex items-center gap-2 rounded-[9px] px-3 py-2.5 text-[12.5px] font-bold ${nightsEligible ? "bg-(--success-soft) text-(--success)" : "bg-(--danger-soft) text-(--danger)"}`}>{nightsEligible ? `${nights} nights meets the ${HOSPITALIZATION_MINIMUM_NIGHTS}-night minimum — eligible for the hospitalization benefit` : `${nights} nights is below the ${HOSPITALIZATION_MINIMUM_NIGHTS}-night minimum required for this benefit`}</div>}
            </div>}

            <div className="mt-7"><SectionTitle>Mode of identification</SectionTitle><div className="grid gap-4 sm:grid-cols-2"><ReadOnlyField label="Claimant ID type" value="Ghana Card"/><InputField label="Ghana Card number" required hint="Required to continue. Use the format GHA-000000000-0." value={claimantIdNumber} onChange={(event) => setClaimantIdNumber(event.target.value)} placeholder="GHA-000000000-0"/></div></div>

            <div className="mt-7"><SectionTitle>Documents you're presenting</SectionTitle><ClaimDocumentChecklist claimType={claimType} documents={documents} uploadingSlot={uploadingSlot} error={docError} onUpload={uploadDocument} onRemove={removeDocument}/></div>
          </>}

          <div className="mt-7 rounded-[9px] bg-(--surface-subtle) p-4"><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={leave}>Cancel</Button><Button type="submit" disabled={!page0Complete}>Next</Button></div></div><Progress page={page}/>
        </form>}

        {page === 1 && <form onSubmit={(event) => { event.preventDefault(); setError(""); setPage(2); }}>
          <SectionTitle>Claimant information</SectionTitle><div className="grid gap-4 sm:grid-cols-2"><InputField label="Full name" required value={contact.fullName} onChange={(event) => updateContact("fullName", event.target.value)}/><InputField label="Primary mobile number" required inputMode="tel" value={contact.primaryPhone} onChange={(event) => updateContact("primaryPhone", event.target.value)}/><InputField label="Additional contact number" inputMode="tel" value={contact.additionalPhone} onChange={(event) => updateContact("additionalPhone", event.target.value)}/><InputField label="Email address" type="email" value={contact.email} onChange={(event) => updateContact("email", event.target.value)}/><InputField label="GPS address" value={contact.gpsAddress} onChange={(event) => updateContact("gpsAddress", event.target.value)}/><InputField label="Residential address" value={contact.residentialAddress} onChange={(event) => updateContact("residentialAddress", event.target.value)}/><InputField label="Staff ID" value={profile?.controllerId ?? ""} disabled/><SelectField label="Nationality" required value={contact.nationality} onChange={(event) => updateContact("nationality", event.target.value)}><option value="Ghanaian">Ghanaian</option><option value="Other">Other</option></SelectField></div>
          <div className="mt-7 flex flex-col-reverse gap-2 rounded-[9px] bg-(--surface-subtle) p-4 sm:flex-row sm:justify-between"><Button variant="secondary" onClick={() => setPage(0)}>Back</Button><Button type="submit" disabled={!contact.fullName.trim() || contact.primaryPhone.trim().length < 7 || !contact.nationality}>Next</Button></div><Progress page={page}/>
        </form>}

        {page === 2 && <form onSubmit={submit}>
          <SectionTitle>Payment option</SectionTitle><p className="mb-4 text-[12.5px] font-semibold text-(--ink)">Select how an approved claim should be paid, if applicable.</p>
          <fieldset><legend className="mb-2 text-[11.5px] font-bold text-(--text-strong)">Mode of payment <span className="text-(--danger)">*</span></legend><div className="space-y-1">{[["BANK_ACCOUNT", "Bank account"], ["MOBILE_MONEY", "Mobile money"], ["CHEQUE", "Cheque"], ["NO_PAYMENT", "No payment details yet"]].map(([value, label]) => <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-[9px] px-3 text-[12.5px] ${paymentMethod === value ? "bg-(--info-soft) font-semibold text-(--text-strong)" : "hover:bg-(--surface-subtle)"}`}><input type="radio" name="paymentMethod" value={value} checked={paymentMethod === value} onChange={() => { setPaymentMethod(value); setPaymentDetails({}); }} className="size-4 accent-(--action-primary)"/>{label}</label>)}</div></fieldset>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">{paymentMethod === "MOBILE_MONEY" && <><SelectField label="Mobile network" required value={paymentDetails.network ?? ""} onChange={(event) => updatePayment("network", event.target.value)}><option value="">Choose network</option><option>MTN</option><option>Telecel</option><option>AirtelTigo</option></SelectField><InputField label="Mobile number" required inputMode="tel" value={paymentDetails.mobileNumber ?? ""} onChange={(event) => updatePayment("mobileNumber", event.target.value)}/><InputField label="Account name" required value={paymentDetails.accountName ?? ""} onChange={(event) => updatePayment("accountName", event.target.value)}/></>}{paymentMethod === "BANK_ACCOUNT" && <><InputField label="Bank name" required value={paymentDetails.bankName ?? ""} onChange={(event) => updatePayment("bankName", event.target.value)}/><InputField label="Account number" required value={paymentDetails.accountNumber ?? ""} onChange={(event) => updatePayment("accountNumber", event.target.value)}/><InputField label="Account name" required value={paymentDetails.accountName ?? ""} onChange={(event) => updatePayment("accountName", event.target.value)}/><InputField label="Branch" value={paymentDetails.branch ?? ""} onChange={(event) => updatePayment("branch", event.target.value)}/></>}{paymentMethod === "CHEQUE" && <InputField label="Payee name" required value={paymentDetails.payeeName ?? ""} onChange={(event) => updatePayment("payeeName", event.target.value)}/>}</div>
          <div className="mt-8"><SectionTitle>Declaration</SectionTitle><div className="max-w-[75ch] space-y-3 text-[12px] leading-relaxed text-(--ink)"><p>Submitting false or altered information may delay payment or result in rejection of the claim.</p><p>I confirm that the information supplied is accurate and that all attached documents are genuine. I understand this claim will be reviewed by staff before it is sent for processing.</p></div><label className="mt-5 flex cursor-pointer items-start gap-3 text-[12.5px] font-semibold text-(--ink)"><input type="checkbox" required checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} className="mt-0.5 size-4 accent-(--action-primary)"/><span>I accept this declaration and confirm the claim details.</span></label><div className="mt-5"><TextareaField label="Comment" value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="Add an optional comment"/></div></div>
          <div className="mt-7 flex flex-col-reverse gap-2 rounded-[9px] bg-(--surface-subtle) p-4 sm:flex-row sm:justify-between"><Button variant="secondary" onClick={() => setPage(1)}>Back</Button><Button type="submit" loading={busy} loadingLabel="Submitting claim..." disabled={!paymentComplete || !declaration}>{resubmitId ? "Resubmit claim" : "Submit claim"}</Button></div><Progress page={page}/>
        </form>}
      </div>
    </main>

    <aside className="rounded-[12px] border border-(--border-default) bg-(--surface-raised) p-5 shadow-[0_2px_6px_rgba(30,39,97,0.08)]">
      <h2 className="mb-3 text-[13px] font-extrabold text-(--text-strong)">Claim summary</h2>
      <dl className="space-y-2.5 text-[12px]">
        <div className="flex justify-between border-b border-(--border-default) pb-2"><dt className="text-(--text-muted)">Claim type</dt><dd className="font-semibold text-(--ink)">{claimType ? claimLabel : "Not selected"}</dd></div>
        <div className="flex justify-between border-b border-(--border-default) pb-2"><dt className="text-(--text-muted)">Filing for</dt><dd className="font-semibold text-(--ink)">{claimantType === "SPOUSE" ? "Spouse" : "Me"}</dd></div>
        <div className="flex justify-between"><dt className="text-(--text-muted)">Member</dt><dd className="font-semibold text-(--ink)">{profile?.fullName ?? "—"}</dd></div>
      </dl>
      {claimType && <div className="mt-3 rounded-[8px] bg-(--surface-subtle) px-3 py-2 text-[11.5px] font-bold text-(--text-strong)">{documents.length} document{documents.length === 1 ? "" : "s"} attached</div>}
      <p className="mt-4 text-[11px] leading-relaxed text-(--text-muted)">Your claim will be reviewed by a staff member before it is sent to the insurer for processing.</p>
    </aside>
    </div>
  </div>;
}
