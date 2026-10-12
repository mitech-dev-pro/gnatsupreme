import { prisma } from "../../lib/prisma.js";
import { getCurrentBenefitPlan } from "../benefits/benefit.service.js";
export async function activeBenefit(
  claimType: "DEATH" | "TOTAL_PERMANENT_DISABILITY" | "CRITICAL_ILLNESS" | "HOSPITALIZATION",
  claimantType: "MEMBER" | "SPOUSE",
) {
  const plan = await getCurrentBenefitPlan();
  const benefit = plan?.benefits.find((item) => item.type === claimType && item.enabled);
  const amount = claimantType === "SPOUSE" ? benefit?.spouseAmount : benefit?.memberAmount;
  return { plan, benefit, amount };
}
export async function uploadedSlotKeys(
  documentIds: number[],
  memberId: number,
  source: "STAFF" | "MEMBER_PORTAL" = "STAFF",
) {
  if (!documentIds.length) return new Set<string>();
  const files = await prisma.storedFile.findMany({
    where: {
      id: { in: documentIds },
      memberId,
      category: "CLAIM_DOCUMENT",
      ...(source === "MEMBER_PORTAL" ? { uploadedByMemberId: memberId } : {}),
    },
    select: { id: true, slotKey: true },
  });
  if (files.length !== new Set(documentIds).size) return null;
  return new Set(files.map((file) => file.slotKey).filter((key): key is string => Boolean(key)));
}
