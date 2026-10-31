import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ClaimDocumentChecklist, { type UploadedClaimDocument } from "./ClaimDocumentChecklist";
import { hasRequiredDocuments, type ClaimType } from "@/lib/claimDocuments";

const cases: { type: ClaimType; slot: string; label: RegExp }[] = [
  {
    type: "HOSPITALIZATION",
    slot: "dischargeSummaryOrBill",
    label: /Hospital Discharge Summary or Medical Bill/,
  },
  { type: "CRITICAL_ILLNESS", slot: "medicalReport", label: /Specialist Confirmation/ },
  { type: "TOTAL_PERMANENT_DISABILITY", slot: "doctorReport", label: /Proof of Inability/ },
  { type: "DEATH", slot: "medicalCertOrDoctorReport", label: /Report of Cause of Death/ },
];

it.each(cases)(
  "shows an actionable required upload and accepts its canonical category for $type",
  async ({ type, slot, label }) => {
    const onUpload = vi.fn();
    function Form() {
      const [documents, setDocuments] = useState<UploadedClaimDocument[]>([]);
      return (
        <>
          <ClaimDocumentChecklist
            claimType={type}
            documents={documents}
            uploadingSlot={null}
            onUpload={(key, file) => {
              onUpload(key, file);
              setDocuments([{ id: 1, slotKey: key, originalName: file.name }]);
            }}
            onRemove={() => setDocuments([])}
          />
          <button
            disabled={
              !hasRequiredDocuments(
                type,
                new Set(documents.flatMap((doc) => (doc.slotKey ? [doc.slotKey] : []))),
              )
            }
          >
            Next
          </button>
        </>
      );
    }
    render(<Form />);
    expect(screen.getByText("0 of 1 required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    const group = screen.getByRole("group", { name: label });
    const file = new File(["%PDF-1.4 test"], "hospital-report.pdf", { type: "application/pdf" });
    await userEvent.upload(within(group).getByLabelText("Attach document"), file);
    expect(onUpload).toHaveBeenCalledWith(slot, file);
    expect(screen.getByText("1 of 1 required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Remove hospital-report.pdf" }));
    expect(screen.getByText("0 of 1 required")).toBeInTheDocument();
    expect(within(group).getByLabelText("Attach document")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  },
);
