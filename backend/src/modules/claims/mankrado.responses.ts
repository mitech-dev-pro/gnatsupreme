import { z } from "zod";
import {
  ClaimsDeliveryError,
  type ClaimSubmissionResult,
  type ExternalClaim,
  type ExternalClaimDetails,
} from "./claims.provider.js";
// Shared by history and details -- both come from the same Mankrado claim record, and a live
// sandbox response confirmed history's claimDate uses this same "date time" shape (not a bare
// ISO date), so treat them identically rather than letting the two schemas drift apart again.
const claimDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,7})?$/)
  .nullable();
// Validate grouping before removing commas so malformed amounts cannot silently change value.
// Confirmed from a live sandbox response: Mankrado sends a claim not yet assessed as ".00" --
// a decimal point with no leading digit -- so the integer part must be optional, not just the
// fractional part.
const payableSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/)
      .transform((amount) => amount.replaceAll(",", "").replace(/^\./, "0.")),
    z.number().finite().nonnegative().transform(String),
  ])
  .nullable();
// Confirmed submission response from the live sandbox (2026-09-08 Postman test):
// {"status":"200","claimId":"316192"} -- no externalStatus/submittedAt are returned.
export function parseSubmission(value: unknown): ClaimSubmissionResult {
  const result = z
    .object({
      status: z.union([z.literal("200"), z.literal(200)]),
      claimId: z
        .union([z.string().trim().min(1).max(200), z.number().int().positive()])
        .transform(String),
    })
    .safeParse(value);
  if (!result.success)
    throw new ClaimsDeliveryError(
      "UNKNOWN",
      "INVALID_RESPONSE",
      "Mankrado acceptance could not be confirmed. Check claim history before attempting another submission.",
    );
  return { externalClaimId: result.data.claimId, status: "SUBMITTED" };
}
export function parseHistory(value: unknown): ExternalClaim[] {
  const { history } = z
    .object({
      status: z.union([z.literal("200"), z.literal(200)]),
      history: z.array(
        z.object({
          claimNumber: z
            .union([z.string().trim().min(1), z.number().int().safe().nonnegative()])
            .transform(String),
          name: z.string().nullable(),
          claimDate: claimDateSchema,
          amountPayable: payableSchema,
          claimStatus: z.string().trim().min(1),
          staff_id: z.string().optional(),
        }),
      ),
    })
    .parse(value);
  // Preserve repeated rows: a repeated claim number does not prove they are the same record.
  return history.map((item) => ({
    id: item.claimNumber,
    claimNumber: item.claimNumber,
    name: item.name,
    claimDate: item.claimDate,
    amountPayable: item.amountPayable,
    status: item.claimStatus,
    staffId: item.staff_id,
  }));
}
// Confirmed details envelope from Postman. The lookup ID and claimNumber are distinct:
// the provider may accept a numeric ID and return a human-readable MC reference.
export function parseDetails(value: unknown, requestedId: string): ExternalClaimDetails {
  const { details } = z
    .object({
      status: z.union([z.literal("200"), z.literal(200)]),
      details: z.object({
        claimNumber: z.string().trim().min(1),
        name: z.string().nullable(),
        claimDate: claimDateSchema,
        amountPayable: payableSchema,
        claimStatus: z.string().trim().min(1),
        rejectReason: z.string().nullable(),
      }),
    })
    .parse(value);
  return {
    id: requestedId,
    claimNumber: details.claimNumber,
    name: details.name,
    claimDate: details.claimDate,
    amountPayable: details.amountPayable,
    status: details.claimStatus,
    rejectReason: details.rejectReason,
  };
}
