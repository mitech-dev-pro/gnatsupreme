import { InputField } from "@/components/ui/FormField";
import { SectionTitle } from "./ClaimFormLayout";
type Props = {
  diagnosisDate: string;
  diagnosingHospital: string;
  diagnosingPhysician: string;
  illness: string;
  illnessOther: string;
  illnesses: string[];
  setDiagnosisDate: (value: string) => void;
  setDiagnosingHospital: (value: string) => void;
  setDiagnosingPhysician: (value: string) => void;
  setIllness: (value: string) => void;
  setIllnessOther: (value: string) => void;
};
export function CriticalIllnessSection({
  diagnosisDate,
  diagnosingHospital,
  diagnosingPhysician,
  illness,
  illnessOther,
  illnesses,
  setDiagnosisDate,
  setDiagnosingHospital,
  setDiagnosingPhysician,
  setIllness,
  setIllnessOther,
}: Props) {
  return (
    <div className="mt-7">
      <SectionTitle>Diagnosis details</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label="Date of diagnosis"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={diagnosisDate}
          onChange={(event) => setDiagnosisDate(event.target.value)}
        />
        <InputField
          label="Diagnosing hospital / physician"
          required
          value={diagnosingHospital}
          onChange={(event) => setDiagnosingHospital(event.target.value)}
          placeholder="e.g. Komfo Anokye Teaching Hospital"
        />
      </div>
      <div className="mt-4">
        <InputField
          label="Diagnosing physician"
          required
          value={diagnosingPhysician}
          onChange={(event) => setDiagnosingPhysician(event.target.value)}
        />
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-bold text-text-strong">
          Named critical illness diagnosed <span className="text-danger">*</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {illnesses.map((item) => (
            <label
              key={item}
              className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs ${illness === item ? "border-action-primary bg-info-soft font-semibold text-text-strong" : "border-border-default text-ink hover:bg-surface-subtle"}`}
            >
              <input
                type="radio"
                name="illness"
                checked={illness === item}
                onChange={() => setIllness(item)}
                className="size-4 accent-action-primary"
              />
              {item}
            </label>
          ))}
          <label
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs ${illness === "Others" ? "border-action-primary bg-info-soft font-semibold text-text-strong" : "border-border-default text-ink hover:bg-surface-subtle"}`}
          >
            <input
              type="radio"
              name="illness"
              checked={illness === "Others"}
              onChange={() => setIllness("Others")}
              className="size-4 accent-action-primary"
            />
            Others (specify)
          </label>
        </div>
        {illness === "Others" && (
          <div className="mt-2">
            <InputField
              label="Specify illness"
              required
              value={illnessOther}
              onChange={(event) => setIllnessOther(event.target.value)}
              hint="Subject to approval by miLife"
            />
          </div>
        )}
      </fieldset>
    </div>
  );
}
