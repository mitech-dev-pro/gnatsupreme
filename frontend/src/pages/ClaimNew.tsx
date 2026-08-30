import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/currency";
import Button from "@/components/ui/Button";
import { InputField, SelectField, TextareaField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";

type MemberLookup = {
  id: number;
  controllerId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  ghanaCardId: string | null;
  school: string;
  status: string;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
  spouse: { id: number; fullName: string; ghanaCardId: string | null } | null;
};

type UploadedDocument = { id: number; originalName: string; sizeBytes: number };
type ContactDetails = { fullName: string; primaryPhone: string; additionalPhone: string; email: string; gpsAddress: string; residentialAddress: string; nationality: string };

const CLAIM_TYPES = [
  { value: "DEATH", label: "Death / funeral benefit" },
  { value: "TOTAL_PERMANENT_DISABILITY", label: "Total permanent disability" },
  { value: "CRITICAL_ILLNESS", label: "Critical illness" },
  { value: "HOSPITALIZATION", label: "Hospitalisation" },
];
const PAGE_LABELS = ["Policy and identification", "Claimant information", "Payment and declaration"];

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-4 bg-(--surface-subtle) px-3 py-2 text-[15px] font-extrabold text-(--text-strong)">{children}</h2>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div><div className="mb-1.5 text-[11.5px] font-bold text-(--text-strong)">{label}</div><div className="min-h-10 rounded-[9px] border border-(--border-default) bg-(--surface-subtle) px-3 py-2.5 text-[12.5px] font-semibold text-(--ink)">{value}</div></div>;
}

function Progress({ page }: { page: number }) {
  return <div className="flex justify-center gap-2 py-5" aria-label={`Step ${page + 1} of 3`}>{PAGE_LABELS.map((label, index) => <span key={label} title={label} className={`h-2.5 rounded-full transition-[width,background-color] duration-200 ${index === page ? "w-8 bg-(--action-primary)" : index < page ? "w-2.5 bg-(--success)" : "w-2.5 bg-(--border-strong)"}`}/>)}</div>;
}

export default function ClaimNew() {
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [page, setPage] = useState(-1);
  const [staffId, setStaffId] = useState("");
  const [member, setMember] = useState<MemberLookup | null>(null);
  const [claimType, setClaimType] = useState("");
  const [claimantType, setClaimantType] = useState<"MEMBER" | "SPOUSE">("MEMBER");
  const [incidentDate, setIncidentDate] = useState("");
  const claimantIdType = "GHANA_CARD";
  const [claimantIdNumber, setClaimantIdNumber] = useState("");
  const [estimate, setEstimate] = useState<{ amount: string | null; available: boolean; note: string | null } | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [contact, setContact] = useState<ContactDetails>({ fullName: "", primaryPhone: "", additionalPhone: "", email: "", gpsAddress: "", residentialAddress: "", nationality: "Ghanaian" });
  const [paymentMethod, setPaymentMethod] = useState("MOBILE_MONEY");
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const dirty = Boolean(member);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => { if (page >= 0) { headingRef.current?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); } }, [page]);

  const claimLabel = CLAIM_TYPES.find((item) => item.value === claimType)?.label ?? "Claim";
  const updateContact = (field: keyof ContactDetails, value: string) => setContact((current) => ({ ...current, [field]: value }));
  const updatePayment = (field: string, value: string) => setPaymentDetails((current) => ({ ...current, [field]: value }));
  const setCoveredPerson = (value: "MEMBER" | "SPOUSE") => {
    setClaimantType(value); setEstimate(null);
    const selected = value === "SPOUSE" ? member?.spouse : member;
    setClaimantIdNumber(selected?.ghanaCardId ?? "");
    setContact({ fullName: selected?.fullName ?? "", primaryPhone: value === "MEMBER" ? member?.phone ?? "" : "", additionalPhone: "", email: value === "MEMBER" ? member?.email ?? "" : "", gpsAddress: "", residentialAddress: "", nationality: "Ghanaian" });
  };

  const lookup = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await api.get("/claims/member-lookup", { params: { staffId: staffId.trim() } });
      const found = response.data.data as MemberLookup;
      setMember(found); setClaimantType("MEMBER"); setClaimantIdNumber(found.ghanaCardId ?? "");
      setContact({ fullName: found.fullName, primaryPhone: found.phone ?? "", additionalPhone: "", email: found.email ?? "", gpsAddress: "", residentialAddress: "", nationality: "Ghanaian" });
      setPage(0);
    } catch (caught: any) { setError(caught?.response?.data?.message || "We could not find that member."); }
    finally { setBusy(false); }
  };

  const getEstimate = async () => {
    if (!member || !claimType) return; setBusy(true); setError("");
    try { const response = await api.get("/claims/estimate", { params: { memberId: member.id, claimType, claimantType } }); setEstimate(response.data.data); }
    catch (caught: any) { setError(caught?.response?.data?.message || "The estimate could not be calculated."); }
    finally { setBusy(false); }
  };

  const upload = async (file: File) => {
    if (!member) return; setUploading(true); setError("");
    const body = new FormData(); body.append("file", file); body.append("category", "OTHER");
    try { const response = await api.post(`/members/${member.id}/files`, body); setDocuments((current) => [...current, response.data.data]); }
    catch (caught: any) { setError(caught?.response?.data?.message || "Document upload failed."); }
    finally { setUploading(false); }
  };

  const removeDocument = async (file: UploadedDocument) => {
    try { await api.delete(`/files/${file.id}`); setDocuments((current) => current.filter((item) => item.id !== file.id)); }
    catch (caught: any) { setError(caught?.response?.data?.message || "The document could not be removed."); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!member || !declaration) return; setBusy(true); setError("");
    try {
      const response = await api.post("/claims/submissions", { memberId: member.id, claimType, claimantType, incidentDate, claimantIdType, claimantIdNumber, claimantContact: contact, paymentMethod, paymentDetails, documentIds: documents.map((file) => file.id), notes });
      navigate("/claims", { replace: true, state: { success: `Claim ${response.data.data.externalClaimId} was submitted successfully.` } });
    } catch (caught: any) {
      const issues = caught?.response?.data?.errors as Array<{ message?: string }> | undefined;
      setError(issues?.map((issue) => issue.message).filter(Boolean).join(" ") || caught?.response?.data?.message || "The claim could not be submitted.");
    } finally { setBusy(false); }
  };

  const leave = () => { if (!dirty || window.confirm("Leave this claim? Information entered here will be lost.")) navigate("/claims"); };
  const paymentComplete = paymentMethod === "NO_PAYMENT" || (paymentMethod === "MOBILE_MONEY" && paymentDetails.network && paymentDetails.mobileNumber && paymentDetails.accountName) || (paymentMethod === "BANK_ACCOUNT" && paymentDetails.bankName && paymentDetails.accountNumber && paymentDetails.accountName) || (paymentMethod === "CHEQUE" && paymentDetails.payeeName);
  if (page === -1) return <div className="-mx-4 -my-5 grid min-h-[calc(100vh-74px)] place-items-center bg-(--app-bg) px-4 py-10 sm:-mx-7 sm:-my-6">
    <section className="w-full max-w-md rounded-[12px] border border-(--border-default) bg-(--surface-raised) p-6 shadow-[0_2px_6px_rgba(30,39,97,0.10)] sm:p-7" aria-labelledby="claim-lookup-heading">
      <button type="button" onClick={() => navigate("/claims")} className="mb-5 text-[11.5px] font-bold text-(--text-muted) hover:text-(--text-strong)">← Back to claims</button>
      <h1 id="claim-lookup-heading" className="text-[22px] font-extrabold text-(--text-strong)">File a claim</h1>
      <p className="mt-1 text-[12.5px] leading-relaxed text-(--text-muted)">Find the policy holder before entering claim information.</p>
      <div className="my-5 rounded-[9px] bg-(--brand-navy) px-4 py-3 text-[12.5px] font-semibold text-(--text-on-action)">Provide the member's Staff ID to continue.</div>
      {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
      <form onSubmit={lookup}><InputField label="Staff ID" required autoFocus value={staffId} onChange={(event) => { setStaffId(event.target.value); setError(""); }} placeholder="Enter Staff ID"/><Button type="submit" loading={busy} loadingLabel="Finding member..." disabled={!staffId.trim()} className="mt-5">Continue</Button></form>
    </section>
  </div>;

  return <div className="mx-auto max-w-[960px] pb-6">
    <div className="mb-4 flex items-center justify-between gap-3"><button type="button" onClick={leave} className="text-[11.5px] font-bold text-(--text-muted) hover:text-(--text-strong)">← Back to claims</button><span className="text-[11px] font-semibold text-(--text-muted)">Step {page + 1} of 3</span></div>
    <main className="overflow-hidden rounded-[12px] border border-(--border-default) bg-(--surface-raised) shadow-[0_2px_6px_rgba(30,39,97,0.08)]">
      <header className="border-b border-(--border-strong) px-5 py-5 sm:px-7"><h1 ref={headingRef} tabIndex={-1} className="text-[22px] font-extrabold text-(--text-strong)">File a claim</h1><p className="mt-1 text-[12px] text-(--text-muted)">{PAGE_LABELS[page]}</p></header>
      <div className="p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[9px] border border-(--info-border) bg-(--info-soft) px-4 py-3 text-[12.5px] text-(--text-strong)" role="status"><span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-(--brand-navy) text-[11px] font-bold text-(--text-on-action)">i</span><strong>{claimType ? claimLabel : "New claim"}</strong><span>for Staff ID {member?.controllerId}</span><span className="font-bold text-(--success)">[{member?.status}]</span></div>
        <p className="mb-5 text-[12px] font-semibold text-(--text-muted)">Fields marked <span className="text-(--danger)">*</span> are required.</p>
        {error && <div className="mb-5"><Alert tone="error">{error}</Alert></div>}

        {page === 0 && <form onSubmit={(event) => { event.preventDefault(); setError(""); setPage(1); }}>
          <SectionTitle>Policy details</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2"><ReadOnlyField label="Policy holder" value={member?.fullName ?? ""}/><ReadOnlyField label="Staff ID / policy number" value={`${member?.controllerId} [${member?.status}]`}/><ReadOnlyField label="District" value={member?.district?.name ?? "Not assigned"}/><ReadOnlyField label="Region" value={member?.district?.region.name ?? "Not assigned"}/><ReadOnlyField label="School" value={member?.school ?? ""}/></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><SelectField label="Type of claim" required value={claimType} onChange={(event) => { setClaimType(event.target.value); setEstimate(null); }}><option value="">Choose claim type</option>{CLAIM_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectField><SelectField label="Covered person" required value={claimantType} onChange={(event) => setCoveredPerson(event.target.value as "MEMBER" | "SPOUSE")}><option value="MEMBER">{member?.fullName} (member)</option>{member?.spouse && <option value="SPOUSE">{member.spouse.fullName} (spouse)</option>}</SelectField><InputField label="Date of incident" type="date" required max={new Date().toISOString().slice(0, 10)} value={incidentDate} onChange={(event) => setIncidentDate(event.target.value)}/></div>
          <div className="mt-5 flex flex-col gap-3 rounded-[9px] border border-(--border-default) bg-(--surface-subtle) px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[12px] font-bold text-(--text-strong)">Estimated claim amount <span className="font-normal text-(--text-muted)">(optional)</span></p><p className="mt-0.5 text-[11.5px] text-(--text-muted)">You can continue without calculating an estimate.</p></div><Button variant="secondary" loading={busy} loadingLabel="Calculating..." disabled={!claimType} onClick={getEstimate} className="w-full sm:w-auto">Calculate estimate</Button></div>
          {estimate && <div className="mt-4 rounded-[9px] border border-(--success-border) bg-(--success-soft) px-4 py-3"><span className="text-[11px] font-bold uppercase tracking-wide text-(--success)">Estimated benefit</span><strong className="ml-3 text-[17px] text-(--text-strong)">{estimate.available ? formatCurrency(estimate.amount) : "Not configured"}</strong><p className="mt-1 text-[11.5px] text-(--text-muted)">{estimate.available ? "Calculated from the active benefit plan. Final assessment may differ." : "No benefit amount is configured for this selection."}</p></div>}
          <div className="mt-7"><SectionTitle>Mode of identification</SectionTitle><div className="grid gap-4 sm:grid-cols-2"><ReadOnlyField label="Claimant ID type" value="Ghana Card"/><InputField label="Ghana Card number" required hint="Required to continue. Use the format GHA-000000000-0." value={claimantIdNumber} onChange={(event) => setClaimantIdNumber(event.target.value)} placeholder="GHA-000000000-0"/></div></div>
          <div className="mt-6"><label className="mb-1.5 block text-[11.5px] font-bold text-(--text-strong)">ID image and supporting documents <span className="font-normal text-(--text-muted)">(optional)</span></label><label className="flex min-h-20 cursor-pointer items-center justify-center rounded-[9px] border border-dashed border-(--border-strong) bg-(--surface-subtle) px-4 text-center hover:border-(--action-primary)"><span className="text-[12px] font-bold text-(--text-strong)">{uploading ? "Uploading..." : "Choose PDF or image files"}</span><input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={uploading || documents.length >= 10} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }}/></label>{documents.length > 0 && <ul className="mt-2 divide-y divide-(--border-default) rounded-[9px] border border-(--border-default)">{documents.map((file) => <li key={file.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="min-w-0 truncate text-[11.5px] font-semibold">{file.originalName}</span><button type="button" onClick={() => void removeDocument(file)} className="shrink-0 text-[11px] font-bold text-(--danger)">Remove</button></li>)}</ul>}</div>
          <div className="mt-7 rounded-[9px] bg-(--surface-subtle) p-4"><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => { setMember(null); setPage(-1); }}>Back</Button><Button type="submit">Next</Button></div></div><Progress page={page}/>
        </form>}

        {page === 1 && <form onSubmit={(event) => { event.preventDefault(); setError(""); setPage(2); }}>
          <SectionTitle>Claimant information</SectionTitle><div className="grid gap-4 sm:grid-cols-2"><InputField label="Full name" required value={contact.fullName} onChange={(event) => updateContact("fullName", event.target.value)}/><InputField label="Primary mobile number" required inputMode="tel" value={contact.primaryPhone} onChange={(event) => updateContact("primaryPhone", event.target.value)}/><InputField label="Additional contact number" inputMode="tel" value={contact.additionalPhone} onChange={(event) => updateContact("additionalPhone", event.target.value)}/><InputField label="Email address" type="email" value={contact.email} onChange={(event) => updateContact("email", event.target.value)}/><InputField label="GPS address" value={contact.gpsAddress} onChange={(event) => updateContact("gpsAddress", event.target.value)}/><InputField label="Residential address" value={contact.residentialAddress} onChange={(event) => updateContact("residentialAddress", event.target.value)}/><InputField label="Staff ID" value={member?.controllerId ?? ""} disabled/><SelectField label="Nationality" required value={contact.nationality} onChange={(event) => updateContact("nationality", event.target.value)}><option value="Ghanaian">Ghanaian</option><option value="Other">Other</option></SelectField></div>
          <p className="mt-5 rounded-[9px] border border-(--info-border) bg-(--info-soft) px-4 py-3 text-[11.5px] text-(--text-muted)">These contact details are stored with this claim only. They do not change the member's profile.</p>
          <div className="mt-7 flex flex-col-reverse gap-2 rounded-[9px] bg-(--surface-subtle) p-4 sm:flex-row sm:justify-between"><Button variant="secondary" onClick={() => setPage(0)}>Back</Button><Button type="submit" disabled={!contact.fullName.trim() || contact.primaryPhone.trim().length < 7 || !contact.nationality}>Next</Button></div><Progress page={page}/>
        </form>}

        {page === 2 && <form onSubmit={submit}>
          <SectionTitle>Payment option</SectionTitle><p className="mb-4 text-[12.5px] font-semibold text-(--ink)">Select how an approved claim should be paid, if applicable.</p>
          <fieldset><legend className="mb-2 text-[11.5px] font-bold text-(--text-strong)">Mode of payment <span className="text-(--danger)">*</span></legend><div className="space-y-1">{[["BANK_ACCOUNT", "Bank account"], ["MOBILE_MONEY", "Mobile money"], ["CHEQUE", "Cheque"], ["NO_PAYMENT", "No payment details yet"]].map(([value, label]) => <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-[9px] px-3 text-[12.5px] ${paymentMethod === value ? "bg-(--info-soft) font-semibold text-(--text-strong)" : "hover:bg-(--surface-subtle)"}`}><input type="radio" name="paymentMethod" value={value} checked={paymentMethod === value} onChange={() => { setPaymentMethod(value); setPaymentDetails({}); }} className="size-4 accent-(--action-primary)"/>{label}</label>)}</div></fieldset>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">{paymentMethod === "MOBILE_MONEY" && <><SelectField label="Mobile network" required value={paymentDetails.network ?? ""} onChange={(event) => updatePayment("network", event.target.value)}><option value="">Choose network</option><option>MTN</option><option>Telecel</option><option>AirtelTigo</option></SelectField><InputField label="Mobile number" required inputMode="tel" value={paymentDetails.mobileNumber ?? ""} onChange={(event) => updatePayment("mobileNumber", event.target.value)}/><InputField label="Account name" required value={paymentDetails.accountName ?? ""} onChange={(event) => updatePayment("accountName", event.target.value)}/></>}{paymentMethod === "BANK_ACCOUNT" && <><InputField label="Bank name" required value={paymentDetails.bankName ?? ""} onChange={(event) => updatePayment("bankName", event.target.value)}/><InputField label="Account number" required value={paymentDetails.accountNumber ?? ""} onChange={(event) => updatePayment("accountNumber", event.target.value)}/><InputField label="Account name" required value={paymentDetails.accountName ?? ""} onChange={(event) => updatePayment("accountName", event.target.value)}/><InputField label="Branch" value={paymentDetails.branch ?? ""} onChange={(event) => updatePayment("branch", event.target.value)}/></>}{paymentMethod === "CHEQUE" && <InputField label="Payee name" required value={paymentDetails.payeeName ?? ""} onChange={(event) => updatePayment("payeeName", event.target.value)}/>}</div>
          <div className="mt-8"><SectionTitle>Declaration</SectionTitle><div className="max-w-[75ch] space-y-3 text-[12px] leading-relaxed text-(--ink)"><p>Submitting false or altered information may delay payment or result in rejection of the claim.</p><p>I confirm that the information supplied is accurate and that all attached documents are genuine.</p></div><label className="mt-5 flex cursor-pointer items-start gap-3 text-[12.5px] font-semibold text-(--ink)"><input type="checkbox" required checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} className="mt-0.5 size-4 accent-(--action-primary)"/><span>I accept this declaration and confirm the claim details.</span></label><div className="mt-5"><TextareaField label="Comment" value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} placeholder="Add an optional comment"/></div></div>
          <div className="mt-7 flex flex-col-reverse gap-2 rounded-[9px] bg-(--surface-subtle) p-4 sm:flex-row sm:justify-between"><Button variant="secondary" onClick={() => setPage(1)}>Back</Button><Button type="submit" loading={busy} loadingLabel="Submitting claim..." disabled={!paymentComplete || !declaration}>Submit claim</Button></div><Progress page={page}/>
        </form>}
      </div>
    </main>
  </div>;
}
