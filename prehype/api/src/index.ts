import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db.js";
import { submissionsRoute } from "./routes/submissions.js";
import { activationRoute } from "./routes/activation.js";

const app = new Hono();

const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5174")
  .split(",")
  .map((o) => o.trim());

app.use(
  "/api/*",
  cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Admin-Key"],
  }),
);

app.route("/api", submissionsRoute);
app.route("/api", activationRoute);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 3001);

// Run pending migrations on startup
console.log("Running database migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations complete.");

console.log(`API server starting on port ${port}`);
console.log(`CORS origins: ${corsOrigins.join(", ")}`);

serve({ fetch: app.fetch, port });
