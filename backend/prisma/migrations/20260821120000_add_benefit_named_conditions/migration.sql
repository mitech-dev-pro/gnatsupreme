ALTER TABLE "benefit_amounts"
ADD COLUMN "named_conditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
