import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  try {
    const userId = await verifyAccessToken(authorization.slice(7));
    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        regionId: true,
        districtId: true,
      },
    });

    if (!user) {
      response.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    response.locals.user = user;
    next();
  } catch {
    response.status(401).json({ success: false, message: "Authentication required" });
  }
}
