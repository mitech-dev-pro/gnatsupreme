import { z } from "zod";
export const claimSubmissionFields = {
  claimantType: z.enum(["MEMBER", "SPOUSE"]),
  claimantIdType: z.literal("GHANA_CARD"),
  claimantIdNumber: z.string().trim().min(3, "Enter the claimant ID number").max(80),
  claimantContact: z.object({
    fullName: z.string().trim().min(2).max(120),
    primaryPhone: z.string().trim().min(7).max(30),
    additionalPhone: z.string().trim().max(30).optional(),
    email: z.string().trim().email("Enter a valid email address").or(z.literal("")).optional(),
    gpsAddress: z.string().trim().max(120).optional(),
    residentialAddress: z.string().trim().max(240).optional(),
    nationality: z.string().trim().min(2).max(80),
  }),
  paymentMethod: z.literal("CHEQUE"),
  paymentDetails: z.record(z.string(), z.string().trim().max(150)).default({}),
  documentIds: z.array(z.number().int().positive()).max(10).default([]),
  notes: z.string().trim().max(1000).optional(),
};
