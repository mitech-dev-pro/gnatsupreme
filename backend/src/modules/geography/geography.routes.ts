import { Router, type Response } from "express";
import type { ZodError } from "zod";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedUser } from "../../middleware/authenticate.js";
import { authorizeRoles } from "../../middleware/authorize.js";
import {
  districtCreateSchema,
  districtQuerySchema,
  districtUpdateSchema,
  idParamsSchema,
  regionSchema,
} from "./geography.schemas.js";

export const regionRouter = Router();
export const districtRouter = Router();

const geographyManagers = authorizeRoles("SUPER_ADMIN", "NATIONAL_ADMIN");

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

function currentUser(response: Response) {
  return response.locals.user as AuthenticatedUser;
}

regionRouter.use(authenticate);
districtRouter.use(authenticate);

regionRouter.get("/", async (_request, response) => {
  const user = currentUser(response);
  const where =
    user.role === "REGIONAL_ADMIN"
      ? { id: user.regionId ?? -1 }
      : user.role === "DISTRICT_ADMIN"
        ? { districts: { some: { id: user.districtId ?? -1 } } }
        : {};

  const regions = await prisma.region.findMany({
    where,
    include: { _count: { select: { districts: true } } },
    orderBy: { name: "asc" },
  });

  response.json({ success: true, data: regions });
});

regionRouter.post("/", geographyManagers, async (request, response) => {
  const parsed = regionSchema.safeParse(request.body);
  if (!parsed.success) return validationFailure(response, parsed.error);

  const duplicate = await prisma.region.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (duplicate) {
    response.status(409).json({ success: false, message: "A region with this name already exists" });
    return;
  }

  const region = await prisma.region.create({ data: parsed.data });
  response.status(201).json({ success: true, data: region });
});

regionRouter.patch("/:id", geographyManagers, async (request, response) => {
  const params = idParamsSchema.safeParse(request.params);
  const body = regionSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const existing = await prisma.region.findUnique({ where: { id: params.data.id } });
  if (!existing) {
    response.status(404).json({ success: false, message: "Region not found" });
    return;
  }

  const duplicate = await prisma.region.findFirst({
    where: {
      id: { not: params.data.id },
      name: { equals: body.data.name, mode: "insensitive" },
    },
  });
  if (duplicate) {
    response.status(409).json({ success: false, message: "A region with this name already exists" });
    return;
  }

  const region = await prisma.region.update({
    where: { id: params.data.id },
    data: body.data,
  });
  response.json({ success: true, data: region });
});

regionRouter.delete("/:id", geographyManagers, async (request, response) => {
  const params = idParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);

  const region = await prisma.region.findUnique({
    where: { id: params.data.id },
    include: { _count: { select: { districts: true, users: true } } },
  });
  if (!region) {
    response.status(404).json({ success: false, message: "Region not found" });
    return;
  }
  if (region._count.districts > 0 || region._count.users > 0) {
    response.status(409).json({
      success: false,
      message: "Region cannot be deleted while it has districts or assigned users",
    });
    return;
  }

  await prisma.region.delete({ where: { id: params.data.id } });
  response.status(204).send();
});

districtRouter.get("/", async (request, response) => {
  const query = districtQuerySchema.safeParse(request.query);
  if (!query.success) return validationFailure(response, query.error);

  const user = currentUser(response);
  const where =
    user.role === "REGIONAL_ADMIN"
      ? { regionId: user.regionId ?? -1 }
      : user.role === "DISTRICT_ADMIN"
        ? { id: user.districtId ?? -1 }
        : query.data.regionId
          ? { regionId: query.data.regionId }
          : {};

  const districts = await prisma.district.findMany({
    where,
    include: {
      region: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
    orderBy: [{ region: { name: "asc" } }, { name: "asc" }],
  });
  response.json({ success: true, data: districts });
});

districtRouter.post("/", geographyManagers, async (request, response) => {
  const parsed = districtCreateSchema.safeParse(request.body);
  if (!parsed.success) return validationFailure(response, parsed.error);

  const region = await prisma.region.findUnique({ where: { id: parsed.data.regionId } });
  if (!region) {
    response.status(400).json({ success: false, message: "Selected region does not exist" });
    return;
  }

  const duplicate = await prisma.district.findFirst({
    where: {
      regionId: parsed.data.regionId,
      name: { equals: parsed.data.name, mode: "insensitive" },
    },
  });
  if (duplicate) {
    response.status(409).json({ success: false, message: "This district already exists in the region" });
    return;
  }

  const district = await prisma.district.create({
    data: parsed.data,
    include: { region: { select: { id: true, name: true } } },
  });
  response.status(201).json({ success: true, data: district });
});

districtRouter.patch("/:id", geographyManagers, async (request, response) => {
  const params = idParamsSchema.safeParse(request.params);
  const body = districtUpdateSchema.safeParse(request.body);
  if (!params.success) return validationFailure(response, params.error);
  if (!body.success) return validationFailure(response, body.error);

  const existing = await prisma.district.findUnique({ where: { id: params.data.id } });
  if (!existing) {
    response.status(404).json({ success: false, message: "District not found" });
    return;
  }

  const regionId = body.data.regionId ?? existing.regionId;
  if (body.data.regionId) {
    const region = await prisma.region.findUnique({ where: { id: regionId } });
    if (!region) {
      response.status(400).json({ success: false, message: "Selected region does not exist" });
      return;
    }
  }

  const name = body.data.name ?? existing.name;
  const duplicate = await prisma.district.findFirst({
    where: {
      id: { not: params.data.id },
      regionId,
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (duplicate) {
    response.status(409).json({ success: false, message: "This district already exists in the region" });
    return;
  }

  const district = await prisma.district.update({
    where: { id: params.data.id },
    data: body.data,
    include: { region: { select: { id: true, name: true } } },
  });
  response.json({ success: true, data: district });
});

districtRouter.delete("/:id", geographyManagers, async (request, response) => {
  const params = idParamsSchema.safeParse(request.params);
  if (!params.success) return validationFailure(response, params.error);

  const district = await prisma.district.findUnique({
    where: { id: params.data.id },
    include: { _count: { select: { users: true, members: true } } },
  });
  if (!district) {
    response.status(404).json({ success: false, message: "District not found" });
    return;
  }
  if (district._count.users > 0 || district._count.members > 0) {
    response.status(409).json({
      success: false,
      message: "District cannot be deleted while it has assigned users or members",
    });
    return;
  }

  await prisma.district.delete({ where: { id: params.data.id } });
  response.status(204).send();
});
