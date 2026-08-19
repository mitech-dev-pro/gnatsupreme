import type { NextFunction, Request, Response } from "express";

import type { UserRole } from "../generated/prisma/enums.js";

type AuthorizedUser = {
  role: UserRole;
};

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.user as AuthorizedUser | undefined;

    if (!user) {
      response.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      response.status(403).json({ success: false, message: "You do not have permission" });
      return;
    }

    next();
  };
}
