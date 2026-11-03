import type { ContactDetails } from "./claimForm.types";

// Cheque claims do not collect phone numbers. Explicitly select the contact fields
// we submit so a saved profile/older claim phone cannot trigger hidden validation.
export function claimantContactForSubmission(contact: ContactDetails) {
  return {
    fullName: contact.fullName,
    nationality: contact.nationality,
    email: contact.email,
    gpsAddress: contact.gpsAddress,
    residentialAddress: contact.residentialAddress,
  };
}
