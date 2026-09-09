import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import DatePicker from "@/components/ui/DatePicker";
import Dropdown from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { applyGhanaCardIdChange } from "@/lib/ghanaCardId";
import { isMinor, parseISODate, toISODate } from "@/lib/utils";
import { Link } from "react-router-dom";
import "./AddMember.css";
import { emptyBeneficiary, Field, RELATIONSHIPS, SummaryRow } from "./AddMember.model";
import { useAddMember } from "./useAddMember";
export default function AddMember() {
  const {
    navigate,
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
  } = useAddMember();
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
          confirmLabel={confirmation === "exit" ? "Discard enrollment" : "Discard spouse details"}
          onConfirm={() => {
            if (confirmation === "exit") navigate("/members");
            else {
              setIncludeSpouse(false);
              setSpouseName("");
              setSpouseGhanaCardId("");
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
                <SummaryRow label="Ghana Card" value={ghanaCardId} />
                <SummaryRow label="Phone" value={phone} />
              </dl>
            </section>
            <section>
              <h3>Employment and location</h3>
              <dl>
                <SummaryRow label="School" value={school} />
                <SummaryRow
                  label="Employment category"
                  value={employmentCategory === "NON_TEACHING" ? "Non-teaching staff" : "Teaching"}
                />
                <SummaryRow label="District" value={selectedDistrict?.name} />
                <SummaryRow label="Region" value={selectedDistrict?.region.name} />
              </dl>
            </section>
            <section>
              <h3>Spouse</h3>
              <dl>
                {includeSpouse ? (
                  <>
                    <SummaryRow label="Name" value={spouseName} />
                    <SummaryRow label="Ghana Card" value={spouseGhanaCardId} />
                  </>
                ) : (
                  <SummaryRow label="Recorded" value="No" />
                )}
              </dl>
            </section>
            <section>
              <h3>Beneficiaries ({beneficiaries.length})</h3>
              <ol>
                {beneficiaries.map((item, index) => (
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
                  help="4 to 7 digits"
                  error={errors.controllerId}
                >
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={controllerId}
                    onChange={(event) =>
                      setControllerId(event.target.value.replace(/\D/g, "").slice(0, 7))
                    }
                    placeholder="e.g. 4545845"
                  />
                </Field>
                <Field label="Full legal name" required error={errors.fullName}>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="As shown on official records"
                  />
                </Field>
                <Field
                  label="Ghana Card ID"
                  help="Format: GHA-000000000-0"
                  error={errors.ghanaCardId}
                >
                  <input
                    value={ghanaCardId}
                    onChange={(event) => setGhanaCardId(applyGhanaCardIdChange(event))}
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
                <Field label="Find district" help="Search by district or region">
                  <input
                    value={districtSearch}
                    onChange={(event) => setDistrictSearch(event.target.value)}
                    placeholder="Type to narrow the list"
                  />
                </Field>
                <Field label="District" required error={errors.districtId}>
                  <Dropdown
                    value={districtId}
                    disabled={districtsLoading}
                    onChange={setDistrictId}
                    placeholder={districtsLoading ? "Loading districts…" : "Select a district"}
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
                      if (!includeSpouse || (!spouseName && !spouseGhanaCardId))
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
                  <Field label="Spouse full name" required error={errors.spouseName}>
                    <input
                      value={spouseName}
                      onChange={(event) => setSpouseName(event.target.value)}
                    />
                  </Field>
                  <Field label="Ghana Card ID" error={errors.spouseGhanaCardId}>
                    <input
                      value={spouseGhanaCardId}
                      onChange={(event) => setSpouseGhanaCardId(applyGhanaCardIdChange(event))}
                      placeholder="GHA-000000000-0"
                    />
                  </Field>
                </div>
              )}

              <div className="enroll-beneficiary-heading">
                <div>
                  <h3>Beneficiaries</h3>
                  <p>At least one beneficiary is required. Up to 10 may be recorded.</p>
                </div>
                <button
                  type="button"
                  disabled={beneficiaries.length >= 10}
                  onClick={() => setBeneficiaries((current) => [...current, emptyBeneficiary()])}
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
                        <button type="button" onClick={() => removeBeneficiary(index)}>
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
                          onChange={(value) => updateBeneficiary(index, { relationship: value })}
                          options={RELATIONSHIPS.map((relationship) => ({
                            value: relationship,
                            label: relationship.charAt(0) + relationship.slice(1).toLowerCase(),
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
                          error={errors[`beneficiaries.${index}.trusteeName`]}
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
                  {completedRequired} of {requiredValues.length} required fields complete
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
