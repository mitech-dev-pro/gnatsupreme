import { InputField } from "@/components/ui/FormField";
import { HOSPITALIZATION_MINIMUM_NIGHTS } from "@/lib/claimDocuments";
import { ReadOnlyField, SectionTitle } from "./ClaimFormLayout";
type Props = {
  hospitalName: string;
  admissionDate: string;
  dischargeDate: string;
  reason: string;
  nights: number | null;
  nightsEligible: boolean;
  setHospitalName: (value: string) => void;
  setAdmissionDate: (value: string) => void;
  setDischargeDate: (value: string) => void;
  setReason: (value: string) => void;
};
export function HospitalizationSection({
  hospitalName,
  admissionDate,
  dischargeDate,
  reason,
  nights,
  nightsEligible,
  setHospitalName,
  setAdmissionDate,
  setDischargeDate,
  setReason,
}: Props) {
  return (
    <div className="mt-7">
      <SectionTitle>Hospitalization details</SectionTitle>
      <InputField
        label="Name of hospital"
        required
        value={hospitalName}
        onChange={(event) => setHospitalName(event.target.value)}
        placeholder="e.g. Komfo Anokye Teaching Hospital"
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InputField
          label="Date of admission"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={admissionDate}
          onChange={(event) => setAdmissionDate(event.target.value)}
        />
        <InputField
          label="Date of discharge"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={dischargeDate}
          onChange={(event) => setDischargeDate(event.target.value)}
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ReadOnlyField
          label="Number of nights admitted"
          value={nights === null ? "—" : `${nights} ${nights === 1 ? "night" : "nights"}`}
        />
        <InputField
          label="Reason for hospitalization / diagnosis"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Malaria complications"
        />
      </div>
      {nights !== null && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${nightsEligible ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
        >
          {nightsEligible
            ? `${nights} nights meets the ${HOSPITALIZATION_MINIMUM_NIGHTS}-night minimum — eligible for the hospitalization benefit`
            : `${nights} nights is below the ${HOSPITALIZATION_MINIMUM_NIGHTS}-night minimum required for this benefit`}
        </div>
      )}
    </div>
  );
}
