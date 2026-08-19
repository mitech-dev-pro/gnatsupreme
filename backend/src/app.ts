import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { districtRouter, regionRouter } from "./modules/geography/geography.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { memberRouter } from "./modules/members/member.routes.js";
import { fileRouter, memberFileRouter } from "./modules/files/file.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { transferRouter } from "./modules/transfers/transfer.routes.js";
import { claimsRouter } from "./modules/claims/claims.routes.js";
import { importRouter } from "./modules/imports/import.routes.js";
import { memberImportRouter } from "./modules/imports/member-import.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { reportRouter } from "./modules/reports/report.routes.js";
import { benefitRouter } from "./modules/benefits/benefit.routes.js";
import { changeRequestRouter, memberWorkflowRouter } from "./modules/workflows/workflow.routes.js";
import { memberAuthRouter } from "./modules/member-auth/member-auth.routes.js";
import { memberPortalRouter } from "./modules/member-portal/member-portal.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { memberNotificationRouter } from "./modules/notifications/member-notification.routes.js";

export const app = express();

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || origin === env.FRONTEND_ORIGIN);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use("/api", apiRateLimiter);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api/auth", authRouter);
app.use("/api/regions", regionRouter);
app.use("/api/districts", districtRouter);
app.use("/api/users", userRouter);
app.use("/api/members", memberRouter);
app.use("/api/members", memberFileRouter);
app.use("/api/files", fileRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/transfers", transferRouter);
app.use("/api/claims", claimsRouter);
app.use("/api/imports", importRouter);
app.use("/api/imports", memberImportRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportRouter);
app.use("/api/benefits", benefitRouter);
app.use("/api/members", memberWorkflowRouter);
app.use("/api/change-requests", changeRequestRouter);
app.use("/api/member-auth", memberAuthRouter);
app.use("/api/member-portal", memberPortalRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/member-portal", memberNotificationRouter);

app.get("/api/health", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    response.status(200).json({
      success: true,
      message: "GNAT Supreme Care API is running",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    response.status(503).json({
      success: false,
      message: "GNAT Supreme Care API is unavailable",
      database: "disconnected",
    });
  }
});
