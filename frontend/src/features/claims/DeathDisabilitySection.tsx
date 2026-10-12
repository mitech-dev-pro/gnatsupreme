import { InputField } from "@/components/ui/FormField";
import { SectionTitle } from "./ClaimFormLayout";
type Props = {
  claimType: "DEATH" | "TOTAL_PERMANENT_DISABILITY";
  subjectName: string;
  relationship: string;
  dateOfEvent: string;
  cause: string;
  setSubjectName: (value: string) => void;
  setRelationship: (value: string) => void;
  setDateOfEvent: (value: string) => void;
  setCause: (value: string) => void;
};
export function DeathDisabilitySection({
  claimType,
  subjectName,
  relationship,
  dateOfEvent,
  cause,
  setSubjectName,
  setRelationship,
  setDateOfEvent,
  setCause,
}: Props) {
  return (
    <div className="mt-7">
      <SectionTitle>
        Description of the {claimType === "DEATH" ? "deceased" : "disabled person"}
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label={`Name of ${claimType === "DEATH" ? "deceased" : "disabled person"}`}
          required
          value={subjectName}
          onChange={(event) => setSubjectName(event.target.value)}
        />
        <InputField
          label="Relationship to member"
          required
          value={relationship}
          onChange={(event) => setRelationship(event.target.value)}
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InputField
          label={claimType === "DEATH" ? "Date of death" : "Date of incidence"}
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={dateOfEvent}
          onChange={(event) => setDateOfEvent(event.target.value)}
        />
        <InputField
          label={claimType === "DEATH" ? "Cause of death" : "Cause of disability"}
          required
          value={cause}
          onChange={(event) => setCause(event.target.value)}
          placeholder={claimType === "DEATH" ? "e.g. Cardiac arrest" : "e.g. Road traffic accident"}
        />
      </div>
    </div>
  );
}
