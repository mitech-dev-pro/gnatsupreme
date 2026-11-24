import { prisma } from "../../lib/prisma.js";
import { claimsProvider } from "./mankrado.provider.js";

// Call only after the route has authorized the local claim. Both portals use the
// same identity validation and atomic snapshot update; no submitted data is changed.
//
// externalId is our stored ExternalClaimSubmission.externalClaimId, taken verbatim from
// whatever Mankrado's submission response returned -- confirmed (against the live sandbox) to
// be a bare numeric ID for some claim types, but a 3-part composite "<type>-<batch>-<id>"
// reference for others (e.g. HOSPITALIZATION's "HP-1124-317173"). Mankrado's claimdetails lookup
// always wants just the bare ID, never the composite, so this derives it here rather than
// requiring every caller to remember to strip the prefix themselves. Only a 3-segment value is
// treated as that composite shape -- a bare ID happening to contain one dash is left untouched,
// since splitting on every dash would misparse an ID that was never prefixed in the first place.
export async function refreshClaimAssessment(claimId: number, externalId: string, staffId: string) {
  const segments = externalId.split("-");
  const lookupId = segments.length >= 3 ? segments.at(-1)! : externalId;
  const details = await claimsProvider.details(lookupId);
  if (details.id !== lookupId || (details.staffId && details.staffId !== staffId))
    throw new Error("Claim mismatch");
  const lastSyncedAt = new Date();
  const externalAssessment = {
    claimNumber: details.claimNumber,
    name: details.name,
    claimDate: details.claimDate,
    amountPayable: details.amountPayable,
    status: details.status ?? "Not provided by Claims Portal",
    rejectReason: details.rejectReason,
  };
  await prisma.externalClaimSubmission.update({
    where: { id: claimId },
    data: { externalAssessment, externalStatus: externalAssessment.status, lastSyncedAt },
  });
  return { ...details, lastSyncedAt };
}
