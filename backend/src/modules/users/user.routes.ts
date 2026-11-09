import argon2 from "argon2";
import { Router, type Response } from "express";
import type { ZodError } from "zod";

import type { UserRole } from "../../generated/prisma/enums.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { invalidateStaffAuth } from "../../lib/auth-cache.js";
import { cachedCount } from "../../lib/cached-count.js";
import { uniqueViolationField, uniqueFieldLabel } from "../../lib/prisma-errors.js";
import {
  assertEmailAvailable,
  invalidatePasswordResetTokens,
  tempPasswordExpiryInstant,
} from "../../lib/account-setup.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import { AppError } from "../../middleware/error-handler.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  createUserSchema,
  updateUserPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdParamsSchema,
  userQuerySchema,
} from "./user.schemas.js";

export const userRouter = Router();

// Independent of (and a backstop under) the per-identifier login rate limiter -- see
// auth.routes.ts. Shown here as a "Locked" badge so a mass lockout is visible at a glance
// rather than inferred from support calls.
const SETUP_LOCKOUT_THRESHOLD = 20;

const staffManagers = authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN");
const publicUserSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  setupRequired: true,
  setupFailedAttempts: true,
  role: true,
  isActive: true,
  regionIds: true,
  districtIds: true,
  createdAt: true,
} as const;

type PublicUser = {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  setupRequired: boolean;
  setupFailedAttempts: number;
  role: UserRole;
  isActive: boolean;
  regionIds: number[];
  districtIds: number[];
  createdAt: Date;
};

// Each user has a different setupArmedAt cutoff, so this can't be a plain groupBy with one
// shared createdAt filter -- a raw DISTINCT ON join against the real per-user cutoff. Only
// meaningful for phone-capable accounts whose setupArmedAt isn't null; everyone else maps to
// nothing (shown as "--" by the caller). One query for a whole page, not one per row.
async function fetchFirstLoginSinceArmed(
  userIds: number[],
): Promise<Map<number, { at: Date; ip: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<
    { user_id: number; created_at: Date; ip_address: string | null }[]
  >(
    Prisma.sql`
      SELECT DISTINCT ON (u.id) u.id AS user_id, al.created_at, al.ip_address
      FROM users u
      JOIN audit_logs al
        ON al.entity_id = u.id::text
        AND al.action = 'LOGIN_SUCCEEDED'
        AND al.created_at >= u.setup_armed_at
      WHERE u.id IN (${Prisma.join(userIds)}) AND u.setup_armed_at IS NOT NULL
      ORDER BY u.id, al.created_at ASC
    `,
  );
  return new Map(rows.map((row) => [row.user_id, { at: row.created_at, ip: row.ip_address }]));
}

function withSetupVisibility<T extends PublicUser>(
  user: T,
  firstLogin: { at: Date; ip: string | null } | undefined,
) {
  return {
    ...user,
    locked: user.setupFailedAttempts >= SETUP_LOCKOUT_THRESHOLD,
    firstLoginSinceArmed: firstLogin ? { at: firstLogin.at, ip: firstLogin.ip } : null,
  };
}

// regionIds/districtIds is just scalar ids on User -- there's no Prisma relation to `include`
// for display names (see schema.prisma's note on Region.legacyUsers/District.legacyUsers), so
// names are looked up separately and attached here.
async function withGeographyNames(user: PublicUser) {
  const [regions, districts] = await Promise.all([
    user.regionIds.length
      ? prisma.region.findMany({
          where: { id: { in: user.regionIds } },
          select: { id: true, name: true },
        })
      : [],
    user.districtIds.length
      ? prisma.district.findMany({
          where: { id: { in: user.districtIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  return { ...user, regions, districts };
}

class UserInputError extends Error {}

function validationFailure(response: Response, error: ZodError) {
  response.status(400).json({
    success: false,
    message: "Invalid request",
    errors: error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function actor(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

function canManageRole(currentUser: AuthenticatedUser, role: UserRole) {
  return currentUser.role === "SUPER_ADMIN" || role !== "SUPER_ADMIN";
}

// Legacy single-value columns, written alongside regionIds/districtIds for rollback safety only
// -- null whenever the scope has anything other than exactly one id. Never read by current
// application code; see schema.prisma's comment on User.legacyRegionId/legacyDistrictId.
function legacyScalar(ids: number[]) {
  return ids.length === 1 ? ids[0]! : null;
}

async function resolveGeographicScope(
  role: UserRole,
  regionIds?: number[],
  districtIds?: number[],
) {
  if (role === "SUPER_ADMIN" || role === "NATIONAL_ADMIN") {
    if ((regionIds && regionIds.length) || (districtIds && districtIds.length)) {
      throw new UserInputError(
        "National and super administrators cannot have geographic assignments",
      );
    }
    return { regionIds: [], districtIds: [], legacyRegionId: null, legacyDistrictId: null };
  }

  if (role === "REGIONAL_ADMIN") {
    if (!regionIds?.length) throw new UserInputError("A regional administrator requires a region");
    if (districtIds?.length) {
      throw new UserInputError("A regional administrator cannot have a district assignment");
    }
    const found = await prisma.region.findMany({ where: { id: { in: regionIds } } });
    if (found.length !== regionIds.length) {
      throw new UserInputError("Selected region does not exist");
    }
    return {
      regionIds,
      districtIds: [],
      legacyRegionId: legacyScalar(regionIds),
      legacyDistrictId: null,
    };
  }

  // DISTRICT_ADMIN
  if (!districtIds?.length)
    throw new UserInputError("A district administrator requires a district");
  const districts = await prisma.district.findMany({ where: { id: { in: districtIds } } });
  if (districts.length !== districtIds.length) {
    throw new UserInputError("Selected district does not exist");
  }
  // regionIds is always derived from the distinct set of the admin's own districts' regions --
  // never independently settable for DISTRICT_ADMIN, even if the caller supplied one.
  const derivedRegionIds = [...new Set(districts.map((d) => d.regionId))];
  return {
    regionIds: derivedRegionIds,
    districtIds,
    legacyRegionId: legacyScalar(derivedRegionIds),
    legacyDistrictId: legacyScalar(districtIds),
  };
}

async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

function safeUserSnapshot(user: {
  id: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  setupRequired: boolean;
  role: UserRole;
  isActive: boolean;
  regionIds: number[];
  districtIds: number[];
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    setupRequired: user.setupRequired,
    role: user.role,
    isActive: user.isActive,
    regionIds: user.regionIds,
    districtIds: user.districtIds,
  };
}

userRouter.use(authenticate, staffManagers);

userRouter.get("/", async (request, response) => {
  const query = userQuerySchema.safeParse(request.query);
  if (!query.success) return validationFailure(response, query.error);

  const currentUser = actor(response);
  const { page, limit, search, role, isActive } = query.data;
  if (currentUser.role === "NATIONAL_ADMIN" && role === "SUPER_ADMIN") {
    response.json({
      success: true,
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
    return;
  }
  const where = {
    ...(role
      ? { role }
      : currentUser.role === "NATIONAL_ADMIN"
        ? { role: { not: "SUPER_ADMIN" as const } }
        : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    cachedCount("users", where, () => prisma.user.count({ where })),
  ]);
  const firstLogins = await fetchFirstLoginSinceArmed(rows.map((row) => row.id));
  const users = await Promise.all(
    rows.map(async (row) =>
      withSetupVisibility(await withGeographyNames(row), firstLogins.get(row.id)),
    ),
  );

  response.json({
    success: true,
    data: users,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

userRouter.get("/:id", async (request, response) => {
  const params = userIdParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);

  const user = await prisma.user.findUnique({
    where: { id: params.data.id },
    select: publicUserSelect,
  });
  if (!user || !canManageRole(actor(response), user.role)) {
    response.status(404).json({ success: false, message: "User not found" });
    return;
  }
  const firstLogins = await fetchFirstLoginSinceArmed([user.id]);
  response.json({
    success: true,
    data: withSetupVisibility(await withGeographyNames(user), firstLogins.get(user.id)),
  });
});

userRouter.post("/", async (request, response) => {
  const parsed = createUserSchema.safeParse(request.body);
  if (!parsed.success) return validationFailure(response, parsed.error);

  const currentUser = actor(response);
  if (!canManageRole(currentUser, parsed.data.role)) {
    response
      .status(403)
      .json({ success: false, message: "You cannot create a super administrator" });
    return;
  }

  if (parsed.data.phone) {
    const duplicatePhone = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
    if (duplicatePhone) {
      response
        .status(409)
        .json({ success: false, message: "A user with this phone number already exists" });
      return;
    }
  }

  try {
    const scope = await resolveGeographicScope(
      parsed.data.role,
      parsed.data.regionIds,
      parsed.data.districtIds,
    );
    // A phone-only account (no email) starts gated behind the setup wall until complete-setup
    // replaces the password. See the simplified-onboarding plan.
    const isPhoneOnly = Boolean(parsed.data.phone) && !parsed.data.email;
    const user = await prisma.$transaction(async (tx) => {
      // User schemas normalize email addresses to lowercase; checked inside this transaction,
      // same as every other write that sets email.
      if (parsed.data.email) await assertEmailAvailable(tx, parsed.data.email);
      return tx.user.create({
        data: {
          fullName: parsed.data.fullName,
          email: parsed.data.email ?? null,
          phone: parsed.data.phone ?? null,
          setupRequired: isPhoneOnly,
          tempPasswordExpiresAt: isPhoneOnly ? tempPasswordExpiryInstant() : null,
          setupArmedAt: isPhoneOnly ? new Date() : null,
          passwordHash: await hashPassword(parsed.data.password),
          role: parsed.data.role,
          ...scope,
        },
        select: publicUserSelect,
      });
    });
    await recordAudit({
      request,
      actor: currentUser,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: user.id,
      description: `Created staff account for ${user.fullName}`,
      afterData: safeUserSnapshot(user),
      regionId: legacyScalar(user.regionIds),
      districtId: legacyScalar(user.districtIds),
    });
    response
      .status(201)
      .json({
        success: true,
        data: withSetupVisibility(await withGeographyNames(user), undefined),
      });
  } catch (error) {
    if (error instanceof UserInputError) {
      response.status(400).json({ success: false, message: error.message });
      return;
    }
    // AppError thrown by assertEmailAvailable (a genuine email conflict) -- caught explicitly,
    // same as UserInputError above, rather than left to the global error-handling middleware
    // (this handler is also exercised directly in tests without going through that middleware).
    if (error instanceof AppError) {
      response
        .status(error.statusCode)
        .json({ success: false, message: error.message, code: error.code });
      return;
    }
    const field = uniqueViolationField(error);
    if (field) {
      response
        .status(409)
        .json({ success: false, message: `${uniqueFieldLabel(field)} is already in use` });
      return;
    }
    throw error;
  }
});

userRouter.patch("/:id", async (request, response) => {
  const params = userIdParamsSchema.safeParse(request.params);
  const body = updateUserSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const existing = await prisma.user.findUnique({ where: { id: params.data.id } });
  if (!existing || !canManageRole(actor(response), existing.role)) {
    response.status(404).json({ success: false, message: "User not found" });
    return;
  }

  const nextRole = body.data.role ?? existing.role;
  if (!canManageRole(actor(response), nextRole)) {
    response
      .status(403)
      .json({ success: false, message: "You cannot assign the super administrator role" });
    return;
  }

  // An account can never end up with neither identifier -- symmetric in both directions now
  // that an admin can freely clear a confirmed email (the old one-directional block existed
  // only to stop phone login reopening, which is moot now that phone never closes; see the
  // simplified-onboarding plan).
  const resultingEmail = body.data.email !== undefined ? body.data.email : existing.email;
  const resultingPhone = body.data.phone !== undefined ? body.data.phone : existing.phone;
  if (resultingEmail === null && resultingPhone === null) {
    response.status(400).json({
      success: false,
      message: "This account needs an email address or a phone number to be reachable.",
    });
    return;
  }

  try {
    const roleChanged = body.data.role !== undefined && body.data.role !== existing.role;
    const scope = await resolveGeographicScope(
      nextRole,
      body.data.regionIds !== undefined
        ? body.data.regionIds
        : roleChanged && (nextRole === "SUPER_ADMIN" || nextRole === "NATIONAL_ADMIN")
          ? []
          : existing.regionIds,
      body.data.districtIds !== undefined
        ? body.data.districtIds
        : roleChanged && nextRole !== "DISTRICT_ADMIN"
          ? []
          : existing.districtIds,
    );

    const user = await prisma.$transaction(async (tx) => {
      if (body.data.email !== undefined) {
        if (body.data.email !== null) {
          await assertEmailAvailable(tx, body.data.email, { excludeUserId: existing.id });
        }
        // Whenever this write changes or clears a previously-set email, an unconsumed reset
        // link already sent to the OLD address must stop working -- a no-op if there wasn't
        // one.
        if (existing.email !== null) await invalidatePasswordResetTokens(tx, existing.id);
      }

      return tx.user.update({
        where: { id: existing.id },
        data: {
          ...(body.data.fullName !== undefined ? { fullName: body.data.fullName } : {}),
          ...(body.data.email !== undefined ? { email: body.data.email } : {}),
          ...(body.data.phone !== undefined ? { phone: body.data.phone } : {}),
          ...(body.data.role !== undefined ? { role: body.data.role } : {}),
          ...scope,
        },
        select: publicUserSelect,
      });
    });
    await invalidateStaffAuth(user.id);

    await recordAudit({
      request,
      actor: actor(response),
      action: "USER_UPDATED",
      entityType: "USER",
      entityId: user.id,
      description: `Updated staff account for ${user.fullName}`,
      beforeData: safeUserSnapshot(existing),
      afterData: safeUserSnapshot(user),
      regionId: legacyScalar(user.regionIds),
      districtId: legacyScalar(user.districtIds),
    });
    const firstLogins = await fetchFirstLoginSinceArmed([user.id]);
    response.json({
      success: true,
      data: withSetupVisibility(await withGeographyNames(user), firstLogins.get(user.id)),
    });
  } catch (error) {
    if (error instanceof UserInputError) {
      response.status(400).json({ success: false, message: error.message });
      return;
    }
    // AppError thrown by assertEmailAvailable (a genuine email conflict) -- caught explicitly,
    // same as UserInputError above, rather than left to the global error-handling middleware
    // (this handler is also exercised directly in tests without going through that middleware).
    if (error instanceof AppError) {
      response
        .status(error.statusCode)
        .json({ success: false, message: error.message, code: error.code });
      return;
    }
    const field = uniqueViolationField(error);
    if (field) {
      response
        .status(409)
        .json({ success: false, message: `${uniqueFieldLabel(field)} is already in use` });
      return;
    }
    throw error;
  }
});

userRouter.patch("/:id/status", async (request, response) => {
  const params = userIdParamsSchema.safeParse(request.params);
  const body = updateUserStatusSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const currentUser = actor(response);
  if (params.data.id === currentUser.id && !body.data.isActive) {
    response
      .status(400)
      .json({ success: false, message: "You cannot deactivate your own account" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id: params.data.id } });
  if (!existing || !canManageRole(currentUser, existing.role)) {
    response.status(404).json({ success: false, message: "User not found" });
    return;
  }

  if (existing.role === "SUPER_ADMIN" && !body.data.isActive) {
    const activeSuperAdministrators = await prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true },
    });
    if (activeSuperAdministrators <= 1) {
      response
        .status(409)
        .json({ success: false, message: "The final super administrator cannot be deactivated" });
      return;
    }
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: existing.id },
      data: { isActive: body.data.isActive },
      select: publicUserSelect,
    }),
    ...(!body.data.isActive
      ? [
          prisma.refreshToken.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]
      : []),
  ]);
  await invalidateStaffAuth(user.id);
  await recordAudit({
    request,
    actor: currentUser,
    action: body.data.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "USER",
    entityId: user.id,
    description: `${body.data.isActive ? "Activated" : "Deactivated"} ${user.fullName}`,
    beforeData: { isActive: existing.isActive },
    afterData: { isActive: user.isActive },
    regionId: legacyScalar(user.regionIds),
    districtId: legacyScalar(user.districtIds),
  });
  const firstLogins = await fetchFirstLoginSinceArmed([user.id]);
  response.json({
    success: true,
    data: withSetupVisibility(await withGeographyNames(user), firstLogins.get(user.id)),
  });
});

userRouter.patch("/:id/password", async (request, response) => {
  const params = userIdParamsSchema.safeParse(request.params);
  const body = updateUserPasswordSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const existing = await prisma.user.findUnique({ where: { id: params.data.id } });
  if (!existing || !canManageRole(actor(response), existing.role)) {
    response.status(404).json({ success: false, message: "User not found" });
    return;
  }

  // An admin resetting a phone-capable account's password is typically responding to an
  // incident (wrong person got the SMS, lost access) -- re-arms setupRequired and clears
  // whatever email is attached, cutting off that email as a login/reset path for whoever
  // currently holds the account. Deliberately tied to "has a phone at all," not to how the
  // account originated -- a classic admin who later gets a phone added inherits this too, by
  // design, since the same insider-claiming risk now applies to them. A classic email-only
  // admin (phone === null) is unaffected -- plain reset, as before.
  const reArm = existing.phone !== null;
  const clearingEmail = reArm && existing.email !== null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: await hashPassword(body.data.password),
        ...(reArm
          ? {
              setupRequired: true,
              tempPasswordExpiresAt: tempPasswordExpiryInstant(),
              setupArmedAt: new Date(),
              setupFailedAttempts: 0,
            }
          : {}),
        ...(clearingEmail ? { email: null } : {}),
      },
    });
    // Same reset-token leak as set-email/admin PATCH /users/:id -- a reset link already sent
    // to the cleared address must stop working the instant the email is cleared.
    if (clearingEmail) await invalidatePasswordResetTokens(tx, existing.id);
    await tx.refreshToken.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  await invalidateStaffAuth(existing.id);
  await recordAudit({
    request,
    actor: actor(response),
    action: "USER_PASSWORD_RESET",
    entityType: "USER",
    entityId: existing.id,
    description: `Reset password and revoked sessions for ${existing.fullName}`,
    ...(clearingEmail ? { beforeData: { email: existing.email }, afterData: { email: null } } : {}),
    regionId: legacyScalar(existing.regionIds),
    districtId: legacyScalar(existing.districtIds),
  });
  response.json({ success: true, message: "Password updated; existing sessions were revoked" });
});
