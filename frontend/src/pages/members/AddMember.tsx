import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useDistricts } from "@/lib/useDistricts";
import "./AddMember.css";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";

const RELATIONSHIPS = ["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"];
const GHANA_CARD = /^GHA-\d{9}-\d$/;

type BeneficiaryDraft = { fullName: string; relationship: string; dateOfBirth: string; trusteeName: string; trusteeGhanaCardId: string };
type Errors = Record<string, string>;
type CreatedMember = { id: number; fullName: string; controllerId: string };

const emptyBeneficiary = (): BeneficiaryDraft => ({ fullName: "", relationship: "CHILD", dateOfBirth: "", trusteeName: "", trusteeGhanaCardId: "" });
const normalizeGhanaCard = (value: string) => value.toUpperCase().replace(/\s/g, "").slice(0, 17);

function Field({ label, required, help, error, children }: { label: string; required?: boolean; help?: string; error?: string; children: ReactNode }) {
  return <label className={`enroll-field ${error ? "has-error" : ""}`}><span>{label}{required && <b>Required</b>}</span>{children}{error ? <small className="enroll-field__error">{error}</small> : help ? <small>{help}</small> : null}</label>;
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return <div className="enroll-summary-row"><dt>{label}</dt><dd>{value || <span>Not provided</span>}</dd></div>;
}

export default function AddMember() {
  const navigate = useNavigate();
  const { districts, loading: districtsLoading } = useDistricts();
  const [controllerId, setControllerId] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [ghanaCardId, setGhanaCardId] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [districtSearch, setDistrictSearch] = useState("");
  const [includeSpouse, setIncludeSpouse] = useState(false);
  const [spouseName, setSpouseName] = useState("");
  const [spouseDob, setSpouseDob] = useState("");
  const [spouseGhanaCardId, setSpouseGhanaCardId] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([emptyBeneficiary()]);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedMember | null>(null);
  const [confirmation, setConfirmation] = useState<"exit" | "spouse" | null>(null);

  const memberSection = useRef<HTMLElement>(null);
  const employmentSection = useRef<HTMLElement>(null);
  const householdSection = useRef<HTMLElement>(null);
  const selectedDistrict = districts.find((item) => String(item.id) === districtId);
  const isDirty = Boolean(controllerId || fullName || dateOfBirth || ghanaCardId || phone || school || districtId || includeSpouse || beneficiaries.some((item) => item.fullName || item.dateOfBirth || item.trusteeName || item.trusteeGhanaCardId));

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (isDirty && !created) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [created, isDirty]);

  const groupedDistricts = useMemo(() => {
    const query = districtSearch.trim().toLowerCase();
    const filtered = query ? districts.filter((item) => `${item.name} ${item.region.name}`.toLowerCase().includes(query)) : districts;
    return Array.from(new Set(filtered.map((item) => item.region.name))).sort().map((region) => ({ region, districts: filtered.filter((item) => item.region.name === region) }));
  }, [districtSearch, districts]);

  const requiredValues = [controllerId, fullName, school, districtId, beneficiaries[0]?.fullName ?? "", ...(includeSpouse ? [spouseName] : [])];
  const completedRequired = requiredValues.filter((value) => value.trim()).length;

  const updateBeneficiary = (index: number, patch: Partial<BeneficiaryDraft>) => setBeneficiaries((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeBeneficiary = (index: number) => setBeneficiaries((current) => current.filter((_, itemIndex) => itemIndex !== index));
  const goTo = (ref: React.RefObject<HTMLElement | null>) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const validate = () => {
    const next: Errors = {};
    if (!/^\d{4,7}$/.test(controllerId.trim())) next.controllerId = "Enter a Controller ID containing 4 to 7 digits.";
    if (fullName.trim().length < 2) next.fullName = "Enter the member's full legal name.";
    if (dateOfBirth && dateOfBirth > new Date().toISOString().slice(0, 10)) next.dateOfBirth = "Date of birth cannot be in the future.";
    if (ghanaCardId && !GHANA_CARD.test(ghanaCardId)) next.ghanaCardId = "Use the format GHA-000000000-0.";
    if (phone && phone.trim().length < 7) next.phone = "Enter a valid phone number.";
    if (school.trim().length < 2) next.school = "Enter the member's school.";
    if (!districtId) next.districtId = "Select a district.";
    if (includeSpouse && spouseName.trim().length < 2) next.spouseName = "Enter the spouse's full name.";
    if (spouseDob && spouseDob > new Date().toISOString().slice(0, 10)) next.spouseDob = "Date of birth cannot be in the future.";
    if (spouseGhanaCardId && !GHANA_CARD.test(spouseGhanaCardId)) next.spouseGhanaCardId = "Use the format GHA-000000000-0.";
    if (ghanaCardId && spouseGhanaCardId && ghanaCardId === spouseGhanaCardId) next.spouseGhanaCardId = "Member and spouse cannot use the same Ghana Card ID.";
    beneficiaries.forEach((item, index) => {
      if (item.fullName.trim().length < 2) next[`beneficiaries.${index}.fullName`] = "Enter the beneficiary's full name.";
      if (item.dateOfBirth && item.dateOfBirth > new Date().toISOString().slice(0, 10)) next[`beneficiaries.${index}.dateOfBirth`] = "Date cannot be in the future.";
      if (item.trusteeGhanaCardId && !GHANA_CARD.test(item.trusteeGhanaCardId)) next[`beneficiaries.${index}.trusteeGhanaCardId`] = "Use the format GHA-000000000-0.";
    });
    setErrors(next);
    if (Object.keys(next).length) {
      setSubmitError("Review the highlighted fields before continuing.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".enroll-field.has-error input, .enroll-field.has-error select")?.focus());
      return false;
    }
    setSubmitError("");
    return true;
  };

  const review = (event: FormEvent) => { event.preventDefault(); if (validate()) { setReviewing(true); window.scrollTo({ top: 0, behavior: "smooth" }); } };

  const submit = async () => {
    if (!validate()) { setReviewing(false); return; }
    setSubmitting(true); setSubmitError("");
    try {
      const response = await api.post("/members", {
        controllerId: controllerId.trim(), fullName: fullName.trim(), dateOfBirth: dateOfBirth || null,
        ghanaCardId: ghanaCardId || null, phone: phone.trim() || null, school: school.trim(), districtId: Number(districtId),
        spouse: includeSpouse ? { fullName: spouseName.trim(), dateOfBirth: spouseDob || null, ghanaCardId: spouseGhanaCardId || null } : null,
        beneficiaries: beneficiaries.map((item) => ({ fullName: item.fullName.trim(), relationship: item.relationship, dateOfBirth: item.dateOfBirth || null, trusteeName: item.trusteeName.trim() || null, trusteeGhanaCardId: item.trusteeGhanaCardId || null })),
      });
      setCreated(response.data.data); setReviewing(false); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      const issues = error?.response?.data?.errors as Array<{ field: string; message: string }> | undefined;
      if (issues?.length) setErrors(Object.fromEntries(issues.map((item) => [item.field, item.message])));
      setSubmitError(issues?.map((item) => item.message).join(" ") || error?.response?.data?.message || "This member could not be enrolled.");
      setReviewing(false);
    } finally { setSubmitting(false); }
  };

  const startAnother = () => {
    setControllerId(""); setFullName(""); setDateOfBirth(""); setGhanaCardId(""); setPhone(""); setSchool(""); setDistrictId(""); setDistrictSearch("");
    setIncludeSpouse(false); setSpouseName(""); setSpouseDob(""); setSpouseGhanaCardId(""); setBeneficiaries([emptyBeneficiary()]); setErrors({}); setSubmitError(""); setCreated(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (created) return <main className="enroll-success"><div className="enroll-success__mark">✓</div><p>Enrollment complete</p><h1>{created.fullName} was added successfully</h1><dl><SummaryRow label="Controller ID" value={created.controllerId}/><SummaryRow label="Initial status" value={<span className="enroll-pending">Pending</span>}/></dl><div><Link to={`/members/${created.id}`}>View member</Link><button type="button" onClick={startAnother}>Add another member</button></div></main>;

  return <main className="enroll-page">
    <Link to="/members" className="enroll-back" onClick={(event) => { if (isDirty) { event.preventDefault(); setConfirmation("exit"); } }}>← Members</Link>
    <header className="enroll-heading"><div><p>Member administration</p><h1>{reviewing ? "Review enrollment" : "New member enrollment"}</h1><span>{reviewing ? "Confirm the information before creating the member record." : "New members begin in Pending status and require workflow approval."}</span></div>{!reviewing && <div className="enroll-progress"><strong>{completedRequired}/{requiredValues.length}</strong><span>required fields complete</span></div>}</header>

    {submitError && <div className="enroll-alert" role="alert"><strong>Enrollment needs attention</strong><span>{submitError}</span></div>}
    {confirmation && <ConfirmationPanel title={confirmation === "exit" ? "Discard this unfinished enrollment?" : "Discard the spouse information entered?"} description={confirmation === "exit" ? "The member, employment, household, and beneficiary information entered on this page will be lost." : "The spouse fields will be cleared. Spouse details can still be added after enrollment."} confirmLabel={confirmation === "exit" ? "Discard enrollment" : "Discard spouse details"} onConfirm={() => { if (confirmation === "exit") navigate("/members"); else { setIncludeSpouse(false); setSpouseName(""); setSpouseDob(""); setSpouseGhanaCardId(""); setConfirmation(null); } }} onCancel={() => setConfirmation(null)} />}

    {reviewing ? <section className="enroll-review">
      <div className="enroll-review__heading"><div><p>Ready for confirmation</p><h2>{fullName}</h2><span>Controller ID {controllerId}</span></div><span className="enroll-pending">Pending</span></div>
      <div className="enroll-review__grid"><section><h3>Member information</h3><dl><SummaryRow label="Date of birth" value={dateOfBirth}/><SummaryRow label="Ghana Card" value={ghanaCardId}/><SummaryRow label="Phone" value={phone}/></dl></section><section><h3>Employment and location</h3><dl><SummaryRow label="School" value={school}/><SummaryRow label="District" value={selectedDistrict?.name}/><SummaryRow label="Region" value={selectedDistrict?.region.name}/></dl></section><section><h3>Spouse</h3><dl>{includeSpouse ? <><SummaryRow label="Name" value={spouseName}/><SummaryRow label="Date of birth" value={spouseDob}/><SummaryRow label="Ghana Card" value={spouseGhanaCardId}/></> : <SummaryRow label="Recorded" value="No"/>}</dl></section><section><h3>Beneficiaries ({beneficiaries.length})</h3><ol>{beneficiaries.map((item, index) => <li key={index}><strong>{item.fullName}</strong><span>{item.relationship.toLowerCase()}{item.dateOfBirth ? `, born ${item.dateOfBirth}` : ""}</span></li>)}</ol></section></div>
      <footer className="enroll-review__actions"><button type="button" onClick={() => setReviewing(false)}>Back to edit</button><button className="primary" type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? "Enrolling…" : "Enroll member"}</button></footer>
    </section> : <div className="enroll-workspace">
      <aside className="enroll-nav"><p>Enrollment</p><button onClick={() => goTo(memberSection)}><i>1</i><span>Member information<small>Identity and contact</small></span></button><button onClick={() => goTo(employmentSection)}><i>2</i><span>Employment<small>School and location</small></span></button><button onClick={() => goTo(householdSection)}><i>3</i><span>Household<small>Spouse and beneficiaries</small></span></button><div><strong>Initial status</strong><span className="enroll-pending">Pending</span><small>Approval follows enrollment.</small></div></aside>

      <form className="enroll-form" onSubmit={review} noValidate>
        <section ref={memberSection} id="member-information"><div className="enroll-section-title"><i>1</i><div><h2>Member information</h2><p>Use the member's official identification details.</p></div></div><div className="enroll-fields">
          <Field label="Controller ID" required help="4 to 7 digits" error={errors.controllerId}><input autoFocus inputMode="numeric" value={controllerId} onChange={(event) => setControllerId(event.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="e.g. 4545845"/></Field>
          <Field label="Full legal name" required error={errors.fullName}><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="As shown on official records"/></Field>
          <Field label="Date of birth" error={errors.dateOfBirth}><input type="date" max={new Date().toISOString().slice(0,10)} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)}/></Field>
          <Field label="Ghana Card ID" help="Format: GHA-000000000-0" error={errors.ghanaCardId}><input value={ghanaCardId} onChange={(event) => setGhanaCardId(normalizeGhanaCard(event.target.value))} placeholder="GHA-000000000-0"/></Field>
          <Field label="Phone number" help="Used for member portal verification" error={errors.phone}><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 024 000 0000"/></Field>
        </div></section>

        <section ref={employmentSection} id="employment"><div className="enroll-section-title"><i>2</i><div><h2>Employment and location</h2><p>Assign the member to the correct administrative scope.</p></div></div><div className="enroll-fields">
          <Field label="School" required error={errors.school}><input value={school} onChange={(event) => setSchool(event.target.value)} placeholder="School or institution"/></Field>
          <Field label="Find district" help="Search by district or region"><input value={districtSearch} onChange={(event) => setDistrictSearch(event.target.value)} placeholder="Type to narrow the list"/></Field>
          <Field label="District" required error={errors.districtId}><select value={districtId} disabled={districtsLoading} onChange={(event) => setDistrictId(event.target.value)}><option value="">{districtsLoading ? "Loading districts…" : "Select a district"}</option>{groupedDistricts.map((group) => <optgroup key={group.region} label={group.region}>{group.districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></Field>
          {selectedDistrict && <div className="enroll-location"><span>Selected location</span><strong>{selectedDistrict.name}</strong><small>{selectedDistrict.region.name} Region</small></div>}
        </div></section>

        <section ref={householdSection} id="household"><div className="enroll-section-title"><i>3</i><div><h2>Household</h2><p>Record spouse and beneficiary information.</p></div></div>
          <div className="enroll-spouse"><div><strong>Does this member have a spouse to record?</strong><span>Spouse details can also be added later.</span></div><div><button type="button" className={!includeSpouse ? "active" : ""} onClick={() => { if (!includeSpouse || (!spouseName && !spouseDob && !spouseGhanaCardId)) setIncludeSpouse(false); else setConfirmation("spouse"); }}>No</button><button type="button" className={includeSpouse ? "active" : ""} onClick={() => setIncludeSpouse(true)}>Yes</button></div></div>
          {includeSpouse && <div className="enroll-fields enroll-spouse-fields"><Field label="Spouse full name" required error={errors.spouseName}><input value={spouseName} onChange={(event) => setSpouseName(event.target.value)}/></Field><Field label="Date of birth" error={errors.spouseDob}><input type="date" max={new Date().toISOString().slice(0,10)} value={spouseDob} onChange={(event) => setSpouseDob(event.target.value)}/></Field><Field label="Ghana Card ID" error={errors.spouseGhanaCardId}><input value={spouseGhanaCardId} onChange={(event) => setSpouseGhanaCardId(normalizeGhanaCard(event.target.value))} placeholder="GHA-000000000-0"/></Field></div>}

          <div className="enroll-beneficiary-heading"><div><h3>Beneficiaries</h3><p>At least one beneficiary is required. Up to 10 may be recorded.</p></div><button type="button" disabled={beneficiaries.length >= 10} onClick={() => setBeneficiaries((current) => [...current, emptyBeneficiary()])}>+ Add beneficiary</button></div>
          <div className="enroll-beneficiaries">{beneficiaries.map((item, index) => <article key={index}><header><span>{index + 1}</span><div><strong>Beneficiary {index + 1}</strong><small>{item.fullName || "Details not complete"}</small></div>{beneficiaries.length > 1 && <button type="button" onClick={() => removeBeneficiary(index)}>Remove</button>}</header><div className="enroll-fields"><Field label="Full name" required error={errors[`beneficiaries.${index}.fullName`]}><input value={item.fullName} onChange={(event) => updateBeneficiary(index, { fullName: event.target.value })}/></Field><Field label="Relationship" required><select value={item.relationship} onChange={(event) => updateBeneficiary(index, { relationship: event.target.value })}>{RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship.charAt(0) + relationship.slice(1).toLowerCase()}</option>)}</select></Field><Field label="Date of birth" error={errors[`beneficiaries.${index}.dateOfBirth`]}><input type="date" max={new Date().toISOString().slice(0,10)} value={item.dateOfBirth} onChange={(event) => updateBeneficiary(index, { dateOfBirth: event.target.value })}/></Field>{item.relationship === "CHILD" && <><Field label="Trustee name" help="Optional when no trustee is required"><input value={item.trusteeName} onChange={(event) => updateBeneficiary(index, { trusteeName: event.target.value })}/></Field><Field label="Trustee Ghana Card" error={errors[`beneficiaries.${index}.trusteeGhanaCardId`]}><input value={item.trusteeGhanaCardId} onChange={(event) => updateBeneficiary(index, { trusteeGhanaCardId: normalizeGhanaCard(event.target.value) })} placeholder="GHA-000000000-0"/></Field></>}</div></article>)}</div>
        </section>

        <footer className="enroll-footer"><Link to="/members" onClick={(event) => { if (isDirty) { event.preventDefault(); setConfirmation("exit"); } }}>Cancel</Link><div><span>{completedRequired} of {requiredValues.length} required fields complete</span><button type="submit">Review enrollment</button></div></footer>
      </form>
    </div>}
  </main>;
}
