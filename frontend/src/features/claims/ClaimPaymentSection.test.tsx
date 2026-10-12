import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClaimPaymentSection } from "./ClaimPaymentSection";
import type { ContactDetails } from "./claimForm.types";
import Button from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";

const contact: ContactDetails = {
  fullName: "Test Member",
  primaryPhone: "0200000000",
  additionalPhone: "",
  email: "",
  gpsAddress: "",
  residentialAddress: "",
  nationality: "Ghanaian",
};
function Form({ source, submit }: { source: "STAFF" | "MEMBER_PORTAL"; submit: () => void }) {
  const [payment, setPayment] = useState<Record<string, string>>({});
  const [declaration, setDeclaration] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ClaimPaymentSection
        source={source}
        paymentDetails={payment}
        contact={contact}
        declaration={declaration}
        notes={notes}
        updatePayment={(key, value) => setPayment((previous) => ({ ...previous, [key]: value }))}
        updateContact={vi.fn()}
        setDeclaration={setDeclaration}
        setNotes={setNotes}
      />
      <Button type="submit" disabled={!declaration}>
        Submit claim
      </Button>
    </form>
  );
}
describe("claim payment and submission controls", () => {
  it.each(["STAFF", "MEMBER_PORTAL"] as const)(
    "submits on the declaration alone, without a payee name, for %s",
    async (source) => {
      const user = userEvent.setup();
      const submit = vi.fn();
      render(<Form source={source} submit={submit} />);
      expect(screen.getByLabelText(/Payee name/)).not.toBeRequired();
      expect(screen.getByRole("button", { name: "Submit claim" })).toBeDisabled();
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: "Submit claim" }));
      expect(submit).toHaveBeenCalledOnce();
      expect(Boolean(screen.queryByText(/reviewed by staff/))).toBe(source === "MEMBER_PORTAL");
    },
  );
  it("blocks duplicate clicks during submission and announces errors", async () => {
    const onClick = vi.fn();
    render(
      <>
        <Button loading loadingLabel="Submitting claim..." onClick={onClick}>
          Submit claim
        </Button>
        <Alert tone="error">The claim could not be submitted.</Alert>
      </>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("The claim could not be submitted.");
  });
});
