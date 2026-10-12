import { InputField, TextareaField } from "@/components/ui/FormField";
import { SectionTitle } from "./ClaimFormLayout";
import type { ContactDetails } from "./claimForm.types";

type Props = {
  source: "STAFF" | "MEMBER_PORTAL";
  paymentDetails: Record<string, string>;
  contact: ContactDetails;
  declaration: boolean;
  notes: string;
  updatePayment: (key: string, value: string) => void;
  updateContact: (key: keyof ContactDetails, value: string) => void;
  setDeclaration: (value: boolean) => void;
  setNotes: (value: string) => void;
};

export function ClaimPaymentSection({
  source,
  paymentDetails,
  contact,
  declaration,
  notes,
  updatePayment,
  updateContact,
  setDeclaration,
  setNotes,
}: Props) {
  return (
    <>
      <SectionTitle>Payment option</SectionTitle>
      <p className="mb-4 text-sm font-semibold text-ink">Approved claims are paid by cheque.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label="Payee name"
          hint="Optional — can be added before the cheque is issued."
          value={paymentDetails.payeeName ?? ""}
          onChange={(event) => updatePayment("payeeName", event.target.value)}
        />
        {!contact.primaryPhone.trim() && (
          <InputField
            label="Contact phone number"
            inputMode="tel"
            hint={
              source === "STAFF"
                ? "Optional — no phone number is on file for this claimant. Add one if you have it."
                : "Optional — we couldn't find a phone number on your profile. Add one if you have it."
            }
            value={contact.primaryPhone}
            onChange={(event) => updateContact("primaryPhone", event.target.value)}
          />
        )}
      </div>
      <div className="mt-8">
        <SectionTitle>Declaration</SectionTitle>
        <div className="max-w-[75ch] space-y-3 text-xs leading-relaxed text-ink">
          <p>
            Submitting false or altered information may delay payment or result in rejection of the
            claim.
          </p>
          <p>
            I confirm that the information supplied is accurate and that all attached documents are
            genuine.
            {source === "MEMBER_PORTAL" &&
              " I understand this claim will be reviewed by staff before it is sent for processing."}
          </p>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            required
            checked={declaration}
            onChange={(event) => setDeclaration(event.target.checked)}
            className="mt-0.5 size-4 accent-action-primary"
          />
          <span>I accept this declaration and confirm the claim details.</span>
        </label>
        <div className="mt-5">
          <TextareaField
            label="Comment"
            value={notes}
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add an optional comment"
          />
        </div>
      </div>
    </>
  );
}
