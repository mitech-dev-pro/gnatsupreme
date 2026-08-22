import { prisma } from "../../lib/prisma.js";

export type ProfileCompletionItemKey =
  | "dateOfBirth"
  | "ghanaCardId"
  | "spouse"
  | "beneficiary";

export type ProfileCompletionItemStatus = "COMPLETE" | "PENDING" | "MISSING";

export type ProfileCompletion = {
  complete: boolean;
  percentage: number;
  showExpandedPrompt: boolean;
  items: Array<{
    key: ProfileCompletionItemKey;
    label: string;
    status: ProfileCompletionItemStatus;
    requestType: "MEMBER_DETAILS" | "SPOUSE" | "BENEFICIARY_ADD";
  }>;
};

function proposedObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type CompletionSnapshot = {
  dateOfBirth: Date | null;
  ghanaCardId: string | null;
  spouseDeclarationStatus: "UNKNOWN" | "NONE" | "HAS_SPOUSE";
  profileCompletionDismissedAt: Date | null;
  hasSpouse: boolean;
  beneficiaryCount: number;
  pendingRequests: Array<{ type: string; proposedData: unknown }>;
};

export function calculateProfileCompletion(
  member: CompletionSnapshot,
): ProfileCompletion {
  const memberDetails = member.pendingRequests.find(
    (request) => request.type === "MEMBER_DETAILS",
  );
  const pendingDetails = proposedObject(memberDetails?.proposedData ?? null);
  const hasPendingSpouse = member.pendingRequests.some(
    (request) => request.type === "SPOUSE",
  );
  const hasPendingBeneficiary = member.pendingRequests.some(
    (request) => request.type === "BENEFICIARY_ADD",
  );

  const items: ProfileCompletion["items"] = [
    {
      key: "dateOfBirth",
      label: "Date of birth",
      status: member.dateOfBirth
        ? "COMPLETE"
        : Object.prototype.hasOwnProperty.call(pendingDetails, "dateOfBirth")
          ? "PENDING"
          : "MISSING",
      requestType: "MEMBER_DETAILS",
    },
    {
      key: "ghanaCardId",
      label: "Ghana Card ID",
      status: member.ghanaCardId
        ? "COMPLETE"
        : Object.prototype.hasOwnProperty.call(pendingDetails, "ghanaCardId")
          ? "PENDING"
          : "MISSING",
      requestType: "MEMBER_DETAILS",
    },
    {
      key: "spouse",
      label: "Spouse declaration",
      status:
        member.hasSpouse || member.spouseDeclarationStatus !== "UNKNOWN"
          ? "COMPLETE"
          : hasPendingSpouse
            ? "PENDING"
            : "MISSING",
      requestType: "SPOUSE",
    },
    {
      key: "beneficiary",
      label: "At least one beneficiary",
      status:
        member.beneficiaryCount > 0
          ? "COMPLETE"
          : hasPendingBeneficiary
            ? "PENDING"
            : "MISSING",
      requestType: "BENEFICIARY_ADD",
    },
  ];
  const completed = items.filter((item) => item.status === "COMPLETE").length;
  const complete = completed === items.length;

  return {
    complete,
    percentage: Math.round((completed / items.length) * 100),
    showExpandedPrompt: !complete && !member.profileCompletionDismissedAt,
    items,
  };
}

export async function getMemberProfileCompletion(
  memberId: number,
): Promise<ProfileCompletion> {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      dateOfBirth: true,
      ghanaCardId: true,
      spouseDeclarationStatus: true,
      profileCompletionDismissedAt: true,
      spouse: { select: { id: true } },
      _count: { select: { beneficiaries: true } },
      changeRequests: {
        where: { status: "PENDING" },
        select: { type: true, proposedData: true },
      },
    },
  });

  return calculateProfileCompletion({
    dateOfBirth: member.dateOfBirth,
    ghanaCardId: member.ghanaCardId,
    spouseDeclarationStatus: member.spouseDeclarationStatus,
    profileCompletionDismissedAt: member.profileCompletionDismissedAt,
    hasSpouse: Boolean(member.spouse),
    beneficiaryCount: member._count.beneficiaries,
    pendingRequests: member.changeRequests,
  });
}
