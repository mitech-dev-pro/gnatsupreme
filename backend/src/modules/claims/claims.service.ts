import { prisma } from "../../lib/prisma.js";
import { getCurrentBenefitPlan } from "../benefits/benefit.service.js";
import { findMemberByGhanaCard } from "../members/member.service.js";

// Resolves a SPOUSE claimant to the independently-enrolled Member they are, if any -- the
// stored link first (fast path, maintained by every member/spouse write elsewhere), falling
// back to a live Ghana Card lookup if the link is unset (e.g. a spouse record that predates
// this feature and hasn't been touched since). Computed once per request and reused by both
// activeBenefit() and the double-payment safeguard below, rather than re-derived twice.
export async function resolveSpouseLinkedMemberId(
  spouse: { linkedMemberId: number | null; ghanaCardId: string | null } | null,
): Promise<number | null> {
  if (!spouse) return null;
  if (spouse.linkedMemberId) return spouse.linkedMemberId;
  if (!spouse.ghanaCardId) return null;
  const match = await findMemberByGhanaCard(spouse.ghanaCardId);
  return match?.id ?? null;
}

// KNOWN LIMITATION: this only fixes what THIS APP displays and stores (estimatedAmount at the
// submission call sites). The real Mankrado submission contract (mankrado.contract.ts) sends
// claimantType + the claimant's own Ghana Card ID but no amount field at all -- Mankrado
// determines the actual payout on its own side, with no concept of a linked spouse. This does
// NOT guarantee Mankrado itself pays the member rate for a linked spouse; a member could see one
// figure here and be paid another. Needs a separate, owned follow-up (confirm with Mankrado how
// a linked spouse should be submitted) before this can be considered complete in a Mankrado-live
// environment.
export async function activeBenefit(
  claimType: "DEATH" | "TOTAL_PERMANENT_DISABILITY" | "CRITICAL_ILLNESS" | "HOSPITALIZATION",
  claimantType: "MEMBER" | "SPOUSE",
  linkedMemberId: number | null = null,
) {
  const plan = await getCurrentBenefitPlan();
  const benefit = plan?.benefits.find((item) => item.type === claimType && item.enabled);
  const payAsMember = claimantType === "MEMBER" || linkedMemberId !== null;
  const amount = payAsMember ? benefit?.memberAmount : benefit?.spouseAmount;
  return { plan, benefit, amount };
}

// Only DEATH and TOTAL_PERMANENT_DISABILITY genuinely mean "this can only happen once per
// person" -- CRITICAL_ILLNESS and HOSPITALIZATION can legitimately recur, so the double-payment
// safeguard below is scoped to just these two.
const ONE_OFF_CLAIM_TYPES = new Set(["DEATH", "TOTAL_PERMANENT_DISABILITY"]);

// Guards against the same real-world event (e.g. a death) being paid out twice: once as a
// SPOUSE claim at the member rate (because the spouse is independently linked to another
// Member), and again as that linked Member's own claim. Checked in both directions. Known,
// accepted limitation: this reads then creates, so two submissions arriving at the same moment
// could both pass -- not solved with additional locking, since this only applies to two claim
// types and is not a high-frequency path.
export async function linkedClaimConflict(
  claimType: "DEATH" | "TOTAL_PERMANENT_DISABILITY" | "CRITICAL_ILLNESS" | "HOSPITALIZATION",
  claimantType: "MEMBER" | "SPOUSE",
  member: { id: number; ghanaCardId?: string | null },
  linkedMemberId: number | null,
): Promise<boolean> {
  if (!ONE_OFF_CLAIM_TYPES.has(claimType)) return false;
  if (claimantType === "SPOUSE") {
    if (linkedMemberId === null) return false;
    const existing = await prisma.externalClaimSubmission.findFirst({
      where: {
        claimType,
        claimantType: "MEMBER",
        memberId: linkedMemberId,
        status: { not: "FAILED" },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }
  // claimantType === "MEMBER": is this member independently linked as someone else's spouse,
  // either via a stored link or a card match (matches both an already-linked spouse row and
  // one that would resolve via the live fallback)?
  const existing = await prisma.externalClaimSubmission.findFirst({
    where: {
      claimType,
      claimantType: "SPOUSE",
      status: { not: "FAILED" },
      member: {
        spouse: {
          OR: [
            { linkedMemberId: member.id },
            ...(member.ghanaCardId ? [{ ghanaCardId: member.ghanaCardId }] : []),
          ],
        },
      },
    },
    select: { id: true },
  });
  return Boolean(existing);
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
