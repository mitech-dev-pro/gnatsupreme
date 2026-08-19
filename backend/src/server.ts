import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`${signal} received. Shutting down gracefully.`);

  server.close(async (error) => {
    await prisma.$disconnect();

    if (error) {
      console.error("Server shutdown failed:", error);
      process.exit(1);
    }

    process.exit(0);
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
