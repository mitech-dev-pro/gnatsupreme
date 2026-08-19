import argon2 from "argon2";
import { input, password } from "@inquirer/prompts";
import { z } from "zod";

import { prisma } from "../src/lib/prisma.js";

const fullNameSchema = z.string().trim().min(2, "Enter the administrator's full name").max(120);
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const validateWith = (schema: z.ZodType<string>) => (value: string) => {
  const result = schema.safeParse(value);
  return result.success || result.error.issues[0]?.message || "Invalid value";
};

async function createAdministrator() {
  console.log("Create the first GNAT Supreme Care super administrator\n");

  const fullNameInput = await input({
    message: "Full name:",
    validate: validateWith(fullNameSchema),
  });
  const emailInput = await input({
    message: "Email:",
    validate: validateWith(emailSchema),
  });
  const passwordInput = await password({
    message: "Password:",
    mask: "*",
    validate: validateWith(passwordSchema),
  });
  await password({
    message: "Confirm password:",
    mask: "*",
    validate: (value) => value === passwordInput || "Passwords do not match",
  });

  const fullName = fullNameSchema.parse(fullNameInput);
  const email = emailSchema.parse(emailInput);

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    throw new Error(`A user with the email ${email} already exists`);
  }

  const passwordHash = await argon2.hash(passwordInput, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const administrator = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      role: "SUPER_ADMIN",
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  });

  console.log("\nSuper administrator created successfully:");
  console.table(administrator);
}

try {
  await createAdministrator();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`\nUnable to create administrator: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
