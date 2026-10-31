import { expect, it } from "vitest";
import { claimantContactForSubmission } from "./claimForm.payload";

it.each(["12", "0201234567", ""])(
  "omits all saved phone values from cheque claims (%s)",
  (primaryPhone) => {
    const contact = {
      fullName: "Test Member",
      nationality: "Ghanaian",
      email: "test@example.test",
      primaryPhone,
      additionalPhone: "3",
      gpsAddress: "GA-123-4567",
      residentialAddress: "Test address",
    };
    expect(claimantContactForSubmission(contact)).toEqual({
      fullName: contact.fullName,
      nationality: contact.nationality,
      email: contact.email,
      gpsAddress: contact.gpsAddress,
      residentialAddress: contact.residentialAddress,
    });
    expect(contact.primaryPhone).toBe(primaryPhone);
  },
);
