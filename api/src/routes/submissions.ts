import { Hono } from "hono";
import crypto from "node:crypto";
import { db } from "../db.js";
import { submissions } from "../schema.js";

/* ---- Rate limiter (in-memory, single-instance) ---------------------- */

const submissionAttemptsByIp = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const history = (submissionAttemptsByIp.get(ip) ?? []).filter((t) => t > hourAgo);
  if (history.length >= 100) return false;
  history.push(now);
  submissionAttemptsByIp.set(ip, history);
  return true;
}

/* ---- Helpers -------------------------------------------------------- */

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function isValidExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return ext === "txt" || ext === "md";
}

function isValidUtf8Text(buffer: ArrayBuffer): boolean {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const text = decoder.decode(buffer);
    // Reject if contains null bytes or excessive control characters (likely binary)
    const controlCount = (text.match(/[\x00-\x08\x0E-\x1F]/g) ?? []).length;
    return controlCount < text.length * 0.01;
  } catch {
    return false;
  }
}

const MAX_FILE_SIZE = 1_048_576; // 1MB
const MAX_RIDER_NAME = 120;
const MAX_DECLARED_UTILITY = 2000;

/* ---- Route ---------------------------------------------------------- */

export const submissionsRoute = new Hono();

submissionsRoute.post("/submissions", async (c) => {
  try {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

    if (!checkRateLimit(ip)) {
      return c.json({ error: "Intake channel is stabilizing. Try again later." }, 429);
    }

    const body = await c.req.parseBody();

    const riderName = typeof body.riderName === "string" ? body.riderName.trim() : "";
    const declaredUtility =
      typeof body.declaredUtility === "string" ? body.declaredUtility.trim() : "";
    const consent = body.consent === "true";
    const noSoulRecord = body.noSoulRecord === "true";
    const file = body.soulRecord;

    // Validate required fields
    if (!riderName || riderName.length > MAX_RIDER_NAME) {
      return c.json({ error: "Record incomplete or invalid." }, 400);
    }

    if (declaredUtility.length > MAX_DECLARED_UTILITY) {
      return c.json({ error: "Record incomplete or invalid." }, 400);
    }

    if (!consent) {
      return c.json({ error: "Record incomplete or invalid." }, 400);
    }

    let soulRecordFilename: string | null = null;
    let soulRecordContent: string | null = null;

    if (!noSoulRecord) {
      // Validate file
      if (!file || !(file instanceof File)) {
        return c.json({ error: "Record incomplete or invalid." }, 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return c.json({ error: "Record incomplete or invalid." }, 400);
      }

      if (!isValidExtension(file.name)) {
        return c.json({ error: "Record incomplete or invalid." }, 400);
      }

      // Read and validate file content as UTF-8 text
      const fileBuffer = await file.arrayBuffer();

      if (!isValidUtf8Text(fileBuffer)) {
        return c.json({ error: "Record incomplete or invalid." }, 400);
      }

      soulRecordFilename = file.name;
      soulRecordContent = new TextDecoder("utf-8").decode(fileBuffer);
    }

    // Insert into database
    const [row] = await db
      .insert(submissions)
      .values({
        riderName,
        soulRecordFilename,
        soulRecordContent,
        declaredUtility: declaredUtility || null,
        consent: true,
        ipHash: hashIp(ip),
      })
      .returning({ id: submissions.id });

    return c.json({ id: row.id, message: "Record preserved." }, 201);
  } catch (err) {
    console.error("Submission error:", err);
    return c.json({ error: "Transmission failed." }, 500);
  }
});
