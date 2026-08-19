import cookieParser from "cookie-parser";
import express from "express";

import { prisma } from "./lib/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";

export const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRouter);

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
