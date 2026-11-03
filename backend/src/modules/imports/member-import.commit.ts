import { beneficiarySchema } from "../members/member.schemas.js";
import type { Request } from "express";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { uniqueFieldLabel, uniqueViolationField } from "../../lib/prisma-errors.js";
import type { AuthenticatedUser } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  auditLinkChanges,
  relinkSpousesForMember,
  reconcileSpouseLink,
} from "../members/member.service.js";
import { bulkRawFields } from "./member-import.service.js";
function optionalDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function runMemberImportCommit(
  jobId: number,
  currentUser: AuthenticatedUser,
  auditRequest: Request,
  startedAt: Date,
) {
  const PROGRESS_EVERY = 200;
  try {
    const rows = await prisma.memberBulkImportRow.findMany({
      where: { importJobId: jobId, status: "READY" },
      orderBy: { rowNumber: "asc" },
    });
    const sourceTotal = await prisma.memberBulkImportRow.count({ where: { importJobId: jobId } });
    let imported = 0;
    let failed = 0;
    let processed = 0;
    for (const row of rows) {
      if (
        !(await prisma.importJob.findFirst({
          where: { id: jobId, status: "PROCESSING", startedAt },
          select: { id: true },
        }))
      )
        return;
      const extra = bulkRawFields(row.rawData);
      // Resolved once at staging and read back as-is here -- deliberately not re-derived from
      // row.districtId, which would mis-resolve a DISTRICT_ADMIN upload's non-teaching rows
      // (their districtId is always forced, so that inference would wrongly read "TEACHING").
      // Pre-migration rows (staged before this feature shipped) have a null column here and
      // fall back to TEACHING, matching their original behavior.
      const employmentCategory = row.employmentCategory ?? "TEACHING";
      try {
        const { member, linkChanges } = await prisma.$transaction(async (transaction) => {
          const reserved = await transaction.memberBulkImportRow.updateMany({
            where: { id: row.id, importJobId: jobId, status: "READY" },
            data: { status: "READY" },
          });
          if (!reserved.count) return { member: null, linkChanges: [] };
          const created = await transaction.member.create({
            include: { spouse: true },
            data: {
              controllerId: row.controllerId!,
              fullName: row.fullName!,
              school: row.school!,
              districtId: row.districtId,
              regionId: row.regionId,
              employmentCategory,
              gender: extra.gender,
              placeOfWork: employmentCategory === "NON_TEACHING" ? extra.placeOfWork : null,
              ghanaCardId: row.ghanaCardId,
              phone: row.phone,
              report20Matched: row.report20Matched,
              // Matches Report 20's own auto-enroll path (report20.service.ts), which also
              // creates members ACTIVE directly -- both are bulk/reviewed-file paths, unlike the
              // manual Add member form (member.routes.ts), which stays PENDING for one-by-one
              // review since there's no equivalent upstream vetting for a single ad-hoc entry.
              status: "ACTIVE",
              createdById: currentUser.id,
              ...(extra.spouseName
                ? {
                    spouseDeclarationStatus: "HAS_SPOUSE",
                    spouse: {
                      create: { fullName: extra.spouseName, ghanaCardId: extra.spouseGhanaCardId },
                    },
                  }
                : {}),
              // Beneficiaries aren't collected for non-teaching staff -- the real files this
              // covers have no beneficiary columns at all.
              ...(employmentCategory !== "NON_TEACHING"
                ? {
                    beneficiaries: {
                      create: beneficiarySchema.parse({
                        fullName: extra.beneficiaryName!,
                        relationship: extra.beneficiaryRelationship!,
                        dateOfBirth: optionalDate(extra.beneficiaryDateOfBirth),
                        trusteeName: extra.trusteeName,
                      }),
                    },
                  }
                : {}),
            },
          });
          await transaction.memberBulkImportRow.update({
            where: { id: row.id },
            data: { status: "IMPORTED", memberId: created.id },
          });
          // Bulk-imported members are created ACTIVE directly, so this is a real transition into
          // an eligible status -- links any stale spouse row elsewhere whose card matches.
          const changes = await relinkSpousesForMember(
            transaction,
            created.id,
            created.ghanaCardId,
          );
          if (created.spouse) {
            const change = await reconcileSpouseLink(
              transaction,
              created.spouse.id,
              created.spouse.ghanaCardId,
              created.id,
              undefined,
            );
            if (change) changes.push(change);
          }
          return { member: created, linkChanges: changes };
        });
        if (!member) continue;
        await auditLinkChanges(auditRequest, currentUser, linkChanges);
        imported += 1;
        await recordAudit({
          request: auditRequest,
          actor: currentUser,
          action: "MEMBER_BULK_ENROLLED",
          entityType: "MEMBER",
          entityId: member.id,
          description: `Bulk enrolled ${member.fullName} (${member.controllerId})`,
          afterData: { importJobId: jobId, rowNumber: row.rowNumber, status: member.status },
          districtId: member.districtId,
        });
      } catch (error) {
        failed += 1;
        // A genuine conflict can still surface here even though staging already checked for
        // duplicates: two import jobs staged concurrently with an overlapping identifier can both
        // show READY, and whichever commits second hits this constraint instead of staging's own
        // check. Report it the same way staging would have (EXISTING, with a plain-language
        // message) rather than dumping the raw Prisma constraint error into `issues`.
        const violatedField = uniqueViolationField(error);
        await prisma.memberBulkImportRow.updateMany({
          where: { id: row.id, status: "READY", importJobId: jobId },
          data:
            violatedField !== null
              ? {
                  status: "EXISTING",
                  issues: [
                    `${uniqueFieldLabel(violatedField)} is already in use by another record`,
                  ],
                }
              : {
                  status: "FAILED",
                  issues: [
                    "Enrollment failed. Check the member and beneficiary details, then upload this row again. If it persists, contact an administrator.",
                  ],
                },
        });
      }
      processed += 1;
      if (processed % PROGRESS_EVERY === 0) {
        await prisma.importJob.updateMany({
          where: { id: jobId, status: "PROCESSING", startedAt },
          data: { processedRows: sourceTotal - rows.length + processed },
        });
      }
    }
    const groups = await prisma.memberBulkImportRow.groupBy({
      by: ["status"],
      where: { importJobId: jobId },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
    const updated = await prisma.importJob.updateMany({
      where: { id: jobId, status: "PROCESSING", startedAt },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        totalRows: sourceTotal,
        processedRows: sourceTotal,
        importedRows: counts.IMPORTED ?? 0,
        readyRows: counts.READY ?? 0,
        invalidRows: (counts.INVALID ?? 0) + (counts.FAILED ?? 0),
        duplicateRows: counts.DUPLICATE ?? 0,
        unmatchedRows: (counts.EXISTING ?? 0) + (counts.OUT_OF_SCOPE ?? 0),
        errorMessage: null,
      },
    });
    if (!updated.count) return;
    await recordAudit({
      request: auditRequest,
      actor: currentUser,
      action: "MEMBER_IMPORT_COMMITTED",
      entityType: "IMPORT_JOB",
      entityId: jobId,
      description: `Committed bulk member import ${jobId}`,
      afterData: { imported, failed, status: "COMPLETED" },
    });
  } catch (error) {
    logger.error({ err: error, importJobId: jobId }, "Member enrollment interrupted");
    await prisma.importJob
      .updateMany({
        where: { id: jobId, status: "PROCESSING", startedAt },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: "Enrollment was interrupted. Retry to resume unfinished rows.",
        },
      })
      .catch(() => undefined);
  }
}
