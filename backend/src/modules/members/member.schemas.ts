import { z } from "zod";

const optionalDate = z.coerce.date().max(new Date(), "Date cannot be in the future").nullable().optional();
const optionalText = z.string().trim().max(120).nullable().optional();
const ghanaCard = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^GHA-\d{9}-\d$/, "Use the format GHA-000000000-0")
  .nullable()
  .optional();

export const spouseSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: optionalDate,
  ghanaCardId: ghanaCard,
});

export const beneficiarySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  relationship: z.enum(["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"]),
  dateOfBirth: optionalDate,
  trusteeName: optionalText,
  trusteeGhanaCardId: ghanaCard,
});

const memberFields = {
  // Controller ID length isn't fixed — currently 4-7 digits, expected to grow over time.
  controllerId: z.string().trim().regex(/^\d{4,7}$/, "Controller ID must contain 4 to 7 digits"),
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: optionalDate,
  ghanaCardId: ghanaCard,
  phone: z.string().trim().min(7).max(30).nullable().optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").nullable().optional(),
  school: z.string().trim().min(2).max(160),
  districtId: z.coerce.number().int().positive(),
  report20Matched: z.boolean().optional(),
};

export const createMemberSchema = z.object({
  ...memberFields,
  spouse: spouseSchema.nullable().optional(),
  beneficiaries: z.array(beneficiarySchema).min(1, "At least one beneficiary is required").max(10),
});

export const updateMemberSchema = z
  .object(memberFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const memberStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PENDING", "FLAGGED", "RETURNED", "REMOVED", "INACTIVE"]),
});

export const memberIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export const beneficiaryIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  beneficiaryId: z.coerce.number().int().positive(),
});

export const memberQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "PENDING", "FLAGGED", "RETURNED", "REMOVED", "INACTIVE"]).optional(),
  regionId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  missingFromReport20: z.coerce.boolean().optional(),
});
