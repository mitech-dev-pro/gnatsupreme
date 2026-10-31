import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { type AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit, type AuditRequestSource } from "../audit/audit.service.js";
import { notifyMember } from "../notifications/notification.service.js";
import { memberScope } from "./member.access.js";
export const memberInclude = {
  district: {
    select: { id: true, name: true, regionId: true, region: { select: { id: true, name: true } } },
  },
  // Only meaningful when there's no district (a NON_TEACHING member's regionId is set directly) --
  // when a district exists, its own region already covers this and this relation is redundant.
  region: { select: { id: true, name: true } },
  spouse: {
    select: {
      id: true,
      fullName: true,
      ghanaCardId: true,
      linkedMember: { select: { id: true, controllerId: true, fullName: true } },
    },
  },
  beneficiaries: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      fullName: true,
      relationship: true,
      dateOfBirth: true,
      trusteeName: true,
      trusteeGhanaCardId: true,
    },
  },
  createdBy: { select: { id: true, fullName: true } },
} as const;
export const memberListInclude = {
  district: { select: { id: true, name: true, region: { select: { id: true, name: true } } } },
  spouse: { select: { fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { beneficiaries: true } },
} as const;
export function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
export function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    DEATH: "death",
    DISABILITY: "disability",
    RETIREMENT: "retirement",
    RESIGNATION: "resignation",
    OTHER: "other",
  };
  return labels[reason] ?? reason.toLowerCase();
}
export async function findAccessibleMember(id: number, user: AuthenticatedUser) {
  return prisma.member.findFirst({
    where: { id, ...memberScope(user) },
    include: memberInclude,
  });
}
type Db = typeof prisma | Prisma.TransactionClient;
// ownerMemberId is the member whose Spouse row this is (the one who made the declaration) --
// used to notify the OTHER side (`after`) when a new link is established, see auditLinkChanges.
type LinkChange = {
  spouseId: number;
  spouseFullName: string;
  before: number | null;
  after: number | null;
  ownerMemberId: number;
};

// Real identity duplication: same card belongs to a DIFFERENT Member row. Stays blocking, no
// status filter -- a removed member's card is already cleared by the removal workflow (see
// workflow.routes.ts POST /:id/remove and scripts/free-removed-members-ghana-cards.ts), so this
// never permanently locks a card away from someone else.
export async function memberGhanaCardConflict(
  ghanaCardId: string | null | undefined,
  exclusions: { memberId?: number } = {},
  db: Db = prisma,
) {
  if (!ghanaCardId) return null;
  return db.member.findFirst({
    where: { ghanaCardId, ...(exclusions.memberId ? { id: { not: exclusions.memberId } } : {}) },
    select: { id: true },
  });
}

// Real duplicate-spouse-claim: same card belongs to a DIFFERENT Spouse row -- two families can't
// both claim the same person as their spouse. Stays blocking.
export async function spouseGhanaCardConflict(
  ghanaCardId: string | null | undefined,
  exclusions: { spouseId?: number } = {},
  db: Db = prisma,
) {
  if (!ghanaCardId) return null;
  return db.spouse.findFirst({
    where: { ghanaCardId, ...(exclusions.spouseId ? { id: { not: exclusions.spouseId } } : {}) },
    select: { id: true },
  });
}

// Cross-table lookup used for LINKING a Spouse to an independently-enrolled Member, and for
// claims.service.ts's activeBenefit() live fallback. Status-gated to ACTIVE/FLAGGED -- a
// confirmed, approved membership is required before anyone is paid the member rate on account of
// it. Never used to re-validate an already-stored link (see reconcileSpouseLink) -- a stored
// link survives the linked member's later status changes (e.g. removal) by design.
export async function findMemberByGhanaCard(
  ghanaCardId: string | null | undefined,
  exclusions: { memberId?: number } = {},
  db: Db = prisma,
) {
  if (!ghanaCardId) return null;
  return db.member.findFirst({
    where: {
      ghanaCardId,
      status: { in: ["ACTIVE", "FLAGGED"] },
      ...(exclusions.memberId ? { id: { not: exclusions.memberId } } : {}),
    },
    select: { id: true },
  });
}

// Called whenever a Spouse row is created or edited. Preserves an existing link as long as the
// spouse's OWN card is unchanged from its previous value, regardless of what has happened to the
// linked member since (e.g. removal nulls their card -- re-deriving from their current card
// would wrongly drop the link on the next unrelated spouse edit). Pass the card as written (the
// row the caller's own create/update actually produced), not a raw request field that might be
// omitted on a partial edit.
export async function reconcileSpouseLink(
  db: Db,
  spouseId: number,
  ghanaCardId: string | null | undefined,
  owningMemberId: number,
  previousGhanaCardId: string | null | undefined,
): Promise<LinkChange | null> {
  const spouse = await db.spouse.findUnique({
    where: { id: spouseId },
    select: { fullName: true, linkedMemberId: true },
  });
  if (!spouse) return null;

  if (spouse.linkedMemberId && ghanaCardId && ghanaCardId === previousGhanaCardId) return null;

  const match = ghanaCardId
    ? await findMemberByGhanaCard(ghanaCardId, { memberId: owningMemberId }, db)
    : null;
  const after = match?.id ?? null;
  if (spouse.linkedMemberId === after) return null;
  await db.spouse.update({ where: { id: spouseId }, data: { linkedMemberId: after } });
  return {
    spouseId,
    spouseFullName: spouse.fullName,
    before: spouse.linkedMemberId,
    after,
    ownerMemberId: owningMemberId,
  };
}

// Called whenever a Member is created, their ghanaCardId changes, or their status transitions
// into ACTIVE/FLAGGED. Clears any stale link pointing AT this member (their old card no longer
// matches) and links the Spouse row (if any, elsewhere) whose card matches the member's new
// card -- Spouse.ghanaCardId is @unique, so at most one row can match.
//
// Must NEVER be called from the member-removal path: removal clears the removed member's own
// ghanaCardId, and running this against that now-null card would unlink every spouse record
// pointing at them, which directly contradicts the decision that an existing link survives
// removal. Removal's existing links are correctly left alone simply by never calling this there.
export async function relinkSpousesForMember(
  db: Db,
  memberId: number,
  newGhanaCardId: string | null | undefined,
): Promise<LinkChange[]> {
  const changes: LinkChange[] = [];
  const member = await db.member.findUnique({ where: { id: memberId }, select: { status: true } });
  const eligible = member?.status === "ACTIVE" || member?.status === "FLAGGED";

  // Explicit OR, not a negated filter -- Prisma's `not` against a nullable column follows SQL
  // three-valued logic and silently excludes NULL rows, which would skip exactly the unlinked
  // spouse rows this is meant to catch.
  const stale = await db.spouse.findMany({
    where: {
      linkedMemberId: memberId,
      ...(newGhanaCardId
        ? { OR: [{ ghanaCardId: null }, { ghanaCardId: { not: newGhanaCardId } }] }
        : {}),
    },
    select: { id: true, fullName: true, linkedMemberId: true, memberId: true },
  });
  for (const spouse of stale) {
    await db.spouse.update({ where: { id: spouse.id }, data: { linkedMemberId: null } });
    changes.push({
      spouseId: spouse.id,
      spouseFullName: spouse.fullName,
      before: spouse.linkedMemberId,
      after: null,
      ownerMemberId: spouse.memberId,
    });
  }

  if (newGhanaCardId && eligible) {
    const match = await db.spouse.findFirst({
      where: { ghanaCardId: newGhanaCardId, memberId: { not: memberId } },
      select: { id: true, fullName: true, linkedMemberId: true, memberId: true },
    });
    if (match && match.linkedMemberId !== memberId) {
      await db.spouse.update({ where: { id: match.id }, data: { linkedMemberId: memberId } });
      changes.push({
        spouseId: match.id,
        spouseFullName: match.fullName,
        before: match.linkedMemberId,
        after: memberId,
        ownerMemberId: match.memberId,
      });
    }
  }
  return changes;
}

// Audits link/unlink changes after the caller's transaction has already committed -- never
// called from inside a transaction, since recordAudit writes via the global prisma client (not
// a transaction client) and an audit row written mid-transaction would survive a rollback as an
// orphan. Also notifies the member on the OTHER side of a newly-established link (never on an
// unlink -- losing a link isn't something that member needs to act on) that they've been named
// as a spouse, so they can confirm it on their own record rather than it being written for them
// unverified. One member's declaration should never silently become the other member's data.
export async function auditLinkChanges(
  request: AuditRequestSource,
  actor: Pick<AuthenticatedUser, "id" | "email" | "regionId" | "districtId"> | null,
  changes: LinkChange[],
) {
  for (const change of changes) {
    await recordAudit({
      request,
      actor,
      action: change.after ? "SPOUSE_MEMBER_LINKED" : "SPOUSE_MEMBER_UNLINKED",
      entityType: "SPOUSE",
      entityId: change.spouseId,
      description: `${change.after ? "Linked" : "Unlinked"} spouse record for ${change.spouseFullName}`,
      beforeData: { linkedMemberId: change.before },
      afterData: { linkedMemberId: change.after },
    });
  }

  const newLinks = changes.filter(
    (change): change is LinkChange & { after: number } => change.after !== null,
  );
  if (newLinks.length === 0) return;
  const owners = await prisma.member.findMany({
    where: { id: { in: [...new Set(newLinks.map((change) => change.ownerMemberId))] } },
    select: { id: true, fullName: true },
  });
  const ownerNameById = new Map(owners.map((owner) => [owner.id, owner.fullName]));
  // Best-effort -- every caller invokes this after its own transaction has already committed,
  // so a failed notification send must not surface as a 500 on an otherwise-successful save
  // (same rationale/pattern as report20.service.ts's notifyMember calls).
  for (const change of newLinks) {
    const ownerName = ownerNameById.get(change.ownerMemberId) ?? "Another GNAT member";
    await notifyMember({
      memberId: change.after,
      type: "SPOUSE_LINK_SUGGESTED",
      title: "You may have been named as a spouse",
      message: `${ownerName} has named you as their spouse on their GNAT Supreme Care profile. If this is correct, add them as your spouse too to keep your own record complete.`,
      idempotencyKey: `spouse-link-suggested:${change.spouseId}:${change.after}`,
    }).catch(() => undefined);
  }
}
