import { prisma } from "../../lib/prisma.js";
import { claimsProvider } from "./mankrado.provider.js";

// Call only after the route has authorized the local claim. Both portals use the
// same identity validation and atomic snapshot update; no submitted data is changed.
export async function refreshClaimAssessment(claimId: number, externalId: string, staffId: string) {
  const details = await claimsProvider.details(externalId);
  if (details.id !== externalId || (details.staffId && details.staffId !== staffId))
    throw new Error("Claim mismatch");
  const lastSyncedAt = new Date();
  const externalAssessment = {
    claimNumber: details.claimNumber,
    name: details.name,
    claimDate: details.claimDate,
    amountPayable: details.amountPayable,
    status: details.status ?? "Not provided by Mankrado",
    rejectReason: details.rejectReason,
  };
  await prisma.externalClaimSubmission.update({
    where: { id: claimId },
    data: { externalAssessment, externalStatus: externalAssessment.status, lastSyncedAt },
  });
  return { ...details, lastSyncedAt };
}
