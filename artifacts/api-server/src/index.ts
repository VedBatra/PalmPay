import http from "http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initSocketIO } from "./lib/socket.js";
import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);
initSocketIO(httpServer);

async function seedAdmin() {
  try {
    const existing = await db.query.adminsTable.findFirst({
      where: (a, { eq }) => eq(a.email, "admin@biopay.dev"),
    });
    if (!existing) {
      const password_hash = await bcrypt.hash("Admin@1234", 10);
      await db.insert(adminsTable).values({ email: "admin@biopay.dev", password_hash });
      logger.info("Default admin created: admin@biopay.dev / Admin@1234");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed admin");
  }
}

httpServer.listen(port, async () => {
  logger.info({ port }, "Server listening");
  await seedAdmin();
});
