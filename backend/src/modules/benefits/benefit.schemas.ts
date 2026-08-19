import { z } from "zod";

const moneySchema = z.preprocess(
  (value) => (typeof value === "number" ? String(value) : value),
  z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, "Use a positive amount with no more than two decimal places")
    .refine((value) => Number(value) >= 0, "Amount cannot be negative"),
);

const benefitSchema = z.object({
  enabled: z.boolean(),
  memberAmount: moneySchema,
  spouseAmount: moneySchema.nullable(),
});

export const createBenefitPlanSchema = z.object({
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .transform((value, context) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        context.addIssue({ code: "custom", message: "Enter a valid effective date" });
        return z.NEVER;
      }
      return date;
    }),
  monthlyPremium: moneySchema.refine((value) => Number(value) > 0, "Monthly premium must be greater than zero"),
  collectionMethod: z.string().trim().min(2).max(200),
  note: z.string().trim().max(500).nullable().optional(),
  benefits: z.object({
    death: benefitSchema,
    totalPermanentDisability: benefitSchema,
    criticalIllness: benefitSchema,
    hospitalization: benefitSchema,
  }),
});

export const benefitPlanIdSchema = z.object({ id: z.coerce.number().int().positive() });

export const benefitHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
