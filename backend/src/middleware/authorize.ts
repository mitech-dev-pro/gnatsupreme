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

// this middleware function checks if the user is authenticated and has one of the allowed roles. If the user is not authenticated, it returns a 401 Unauthorized response. If the user does not have the required role, it returns a 403 Forbidden response. If the user is authenticated and has the required role, it calls the next middleware function in the stack.