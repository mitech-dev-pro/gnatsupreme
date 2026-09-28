import { z } from "zod";

import { isMinor } from "../../lib/age.js";

const optionalDate = z.coerce
  .date()
  .max(new Date(), "Date cannot be in the future")
  .nullable()
  .optional();
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
  ghanaCardId: ghanaCard,
});

// Date of birth is collected only here -- nowhere else in the app still asks for it -- because
// it's the only input to the guardian-required check below. A minor beneficiary (computed from
// dateOfBirth, not from relationship === "CHILD", since an adult child is still relationship
// CHILD) must have trustee details on file.
//
// Exported separately (rather than only the refined version) so routes doing a partial update
// can still call `.partial()` -- that's a ZodObject-only method the refined ZodEffects below
// doesn't expose. Partial updates intentionally don't re-run the guardian refinement (a patch
// that only changes trusteeName shouldn't be forced to resupply dateOfBirth just to pass it).
export const beneficiaryBaseSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  relationship: z.enum(["CHILD", "SPOUSE", "PARENT", "SIBLING", "OTHER"]),
  dateOfBirth: optionalDate,
  trusteeName: optionalText,
  trusteeGhanaCardId: ghanaCard,
});

export const beneficiarySchema = beneficiaryBaseSchema.superRefine(
  (value, ctx) => {
    if (!isMinor(value.dateOfBirth ?? null)) return;
    if (!value.trusteeName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trusteeName"],
        message: "Trustee name is required for a beneficiary under 18",
      });
    }
  },
);

const memberFields = {
  // Not digits-only -- non-teaching staff IDs are alphanumeric (e.g. "GNATNT2020001",
  // "EMP100519"), sharing the same ID space/uniqueness as teaching staff's numeric Controller ID.
  // Uppercased for consistency, same reason ghanaCard is: so "gnatnt2020001" and "GNATNT2020001"
  // can't silently become two different IDs.
  controllerId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,20}$/, "Controller ID must be 4 to 20 letters/digits"),
  fullName: z.string().trim().min(2).max(120),
  ghanaCardId: ghanaCard,
  phone: z.string().trim().min(7).max(30).nullable().optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .nullable()
    .optional(),
  school: z.string().trim().min(2).max(160),
  // Required for TEACHING, optional for NON_TEACHING (which uses placeOfWork/regionId instead) --
  // see createMemberSchema's refinement below. A DISTRICT_ADMIN caller always has this forced to
  // their own district before validation runs (member.routes.ts), regardless of category.
  districtId: z.coerce.number().int().positive().optional(),
  report20Matched: z.boolean().optional(),
  // Staff-only, set on enrollment or edit -- never exposed to member self-onboarding or
  // self-service change requests (neither `onboardingDetailsSchema` nor
  // `memberDetailsChangeSchema` includes this field). Gates whether Report 20 reconciliation
  // applies to this member at all -- see reconcileReport20 in imports/report20.service.ts.
  employmentCategory: z.enum(["TEACHING", "NON_TEACHING"]).optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  // Free-text workplace for a NON_TEACHING member with no real district -- required when
  // employmentCategory is NON_TEACHING, see createMemberSchema's refinement below.
  placeOfWork: z.string().trim().min(2).max(200).nullable().optional(),
  // Only meaningful for a NON_TEACHING member with no district; ignored otherwise since regionId
  // is derived from the district in that case -- see resolveMemberRegionId in member-region.ts.
  regionId: z.coerce.number().int().positive().optional(),
};

export const createMemberSchema = z
  .object({
    ...memberFields,
    spouse: spouseSchema.nullable().optional(),
    // Non-teaching staff aren't required to have a beneficiary on file -- see the superRefine
    // below, which enforces the min(1) only for TEACHING.
    beneficiaries: z.array(beneficiarySchema).max(10),
  })
  .superRefine((value, ctx) => {
    if (!value.gender) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gender"],
        message: "Select a gender",
      });
    }
    const category = value.employmentCategory ?? "TEACHING";
    if (category === "TEACHING") {
      if (!value.districtId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["districtId"],
          message: "Select a district",
        });
      }
      if (value.beneficiaries.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beneficiaries"],
          message: "At least one beneficiary is required",
        });
      }
    }
    if (category === "NON_TEACHING" && !value.placeOfWork) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["placeOfWork"],
        message: "Place of work is required for non-teaching staff",
      });
    }
  });

export const updateMemberSchema = z
  .object(memberFields)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update",
  );

export const memberStatusSchema = z.object({
  status: z.enum([
    "ACTIVE",
    "PENDING",
    "FLAGGED",
    "RETURNED",
    "REMOVED",
    "INACTIVE",
  ]),
});

export const memberIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export const beneficiaryIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  beneficiaryId: z.coerce.number().int().positive(),
});

export const memberQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z
    .enum(["ACTIVE", "PENDING", "FLAGGED", "RETURNED", "REMOVED", "INACTIVE"])
    .optional(),
  regionId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  school: z.string().trim().max(160).optional(),
  missingFromReport20: z.coerce.boolean().optional(),
  // A plain z.coerce.boolean() can't distinguish "not registered" from "no filter" -- coercing
  // any non-empty string (including the literal "false") to true is exactly the trap
  // missingFromReport20 above works around by never sending "false" at all. Registered has a
  // real "false" state to filter on, so it needs the three-way enum instead.
  registered: z.enum(["true", "false"]).optional(),
  employmentCategory: z.enum(["TEACHING", "NON_TEACHING"]).optional(),
});

export const memberSchoolsQuerySchema = z.object({
  districtId: z.coerce.number().int().positive().optional(),
});

export const memberStatsQuerySchema = z.object({
  regionId: z.coerce.number().int().positive().optional(),
  districtId: z.coerce.number().int().positive().optional(),
  school: z.string().trim().max(160).optional(),
  // z.coerce.boolean() means Boolean("false") === true — the frontend relies on this by never
  // sending the literal string "false" (it omits the param instead). Don't "fix" the frontend to
  // send missingFromReport20=false explicitly; that would silently flip it back to true.
  missingFromReport20: z.coerce.boolean().optional(),
});
