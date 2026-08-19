import argon2 from "argon2";
import { input, password } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";
import { staffPasswordSchema } from "../src/modules/users/user.schemas.js";

const validatePassword = (value: string) => {
  const result = staffPasswordSchema.safeParse(value);
  return result.success || result.error.issues[0]?.message || "Invalid password";
};

async function resetAdministratorPassword() {
  const email = (await input({ message: "Administrator email:" })).trim().toLowerCase();
  const administrator = await prisma.user.findUnique({ where: { email } });

  if (!administrator || !["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(administrator.role)) {
    throw new Error("An administrator with that email was not found");
  }

  const nextPassword = await password({
    message: "New password:",
    mask: "*",
    validate: validatePassword,
  });
  await password({
    message: "Confirm new password:",
    mask: "*",
    validate: (value) => value === nextPassword || "Passwords do not match",
  });

  const passwordHash = await argon2.hash(nextPassword, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.$transaction([
    prisma.user.update({ where: { id: administrator.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: administrator.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  console.log(`Password reset successfully for ${administrator.email}. Existing sessions were revoked.`);
}

try {
  await resetAdministratorPassword();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to reset password");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
