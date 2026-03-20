import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { warActivation } from "../schema.js";

/* ---- Phase enum ----------------------------------------------------- */

const VALID_PHASES = ["pre_tribes", "one_tribe_ready", "both_tribes_ready"] as const;
type WarPhase = (typeof VALID_PHASES)[number];

function isValidPhase(v: unknown): v is WarPhase {
  return typeof v === "string" && (VALID_PHASES as readonly string[]).includes(v);
}

/* ---- Response shape ------------------------------------------------- */

type TribeCommand = {
  name: string | null;
  id: string | null;
  captainName: string | null;
};

type ActivationResponse = {
  phase: WarPhase;
  tribeA: TribeCommand | null;
  tribeB: TribeCommand | null;
  activatedAt: string | null;
  bothTribesReadyAt: string | null;
};

const DEFAULT_RESPONSE: ActivationResponse = {
  phase: "pre_tribes",
  tribeA: null,
  tribeB: null,
  activatedAt: null,
  bothTribesReadyAt: null,
};

function rowToResponse(row: typeof warActivation.$inferSelect): ActivationResponse {
  const hasTribeA = row.tribeAName || row.tribeAId || row.tribeACaptainName;
  const hasTribeB = row.tribeBName || row.tribeBId || row.tribeBCaptainName;

  return {
    phase: isValidPhase(row.phase) ? row.phase : "pre_tribes",
    tribeA: hasTribeA
      ? { name: row.tribeAName, id: row.tribeAId, captainName: row.tribeACaptainName }
      : null,
    tribeB: hasTribeB
      ? { name: row.tribeBName, id: row.tribeBId, captainName: row.tribeBCaptainName }
      : null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    bothTribesReadyAt: row.bothTribesReadyAt?.toISOString() ?? null,
  };
}

/* ---- Helpers -------------------------------------------------------- */

function derivePhase(tribeAName: string | null, tribeAId: string | null, tribeBName: string | null, tribeBId: string | null): WarPhase {
  const aReady = !!(tribeAName && tribeAId);
  const bReady = !!(tribeBName && tribeBId);
  if (aReady && bReady) return "both_tribes_ready";
  if (aReady || bReady) return "one_tribe_ready";
  return "pre_tribes";
}

/** Parse an ISO 8601 string strictly. Returns Date or null on invalid input. */
function parseISO(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

/* ---- Route ---------------------------------------------------------- */

export const activationRoute = new Hono();

activationRoute.get("/activation", async (c) => {
  const rows = await db.select().from(warActivation).where(eq(warActivation.id, "singleton"));
  if (rows.length === 0) {
    return c.json(DEFAULT_RESPONSE);
  }
  return c.json(rowToResponse(rows[0]));
});

activationRoute.put("/activation", async (c) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return c.json({ error: "Admin endpoint not configured." }, 503);
  }

  const key = c.req.header("x-admin-key");
  if (key !== adminSecret) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const body = await c.req.json();

  // Validate activatedAt if provided
  let activatedAtInput: Date | null | undefined = undefined; // undefined = don't touch
  if (body.activatedAt !== undefined) {
    if (body.activatedAt === null) {
      activatedAtInput = null; // explicit clear
    } else {
      activatedAtInput = parseISO(body.activatedAt);
      if (activatedAtInput === null) {
        return c.json({ error: "Invalid activatedAt. Must be a valid ISO 8601 timestamp." }, 400);
      }
    }
  }

  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  // Fetch existing row to determine timestamp logic
  const existing = await db.select().from(warActivation).where(eq(warActivation.id, "singleton"));
  const existingRow = existing[0] ?? null;

  // Determine activatedAt value
  let activatedAt: Date | null;
  if (activatedAtInput !== undefined) {
    activatedAt = activatedAtInput;
  } else {
    activatedAt = existingRow?.activatedAt ?? null;
  }

  // Partial merge: omitted fields keep existing values
  const tribeAName = body.tribeAName !== undefined ? str(body.tribeAName) : (existingRow?.tribeAName ?? null);
  const tribeAId = body.tribeAId !== undefined ? str(body.tribeAId) : (existingRow?.tribeAId ?? null);
  const tribeBName = body.tribeBName !== undefined ? str(body.tribeBName) : (existingRow?.tribeBName ?? null);
  const tribeBId = body.tribeBId !== undefined ? str(body.tribeBId) : (existingRow?.tribeBId ?? null);
  const tribeACaptainName = body.tribeACaptainName !== undefined ? str(body.tribeACaptainName) : (existingRow?.tribeACaptainName ?? null);
  const tribeBCaptainName = body.tribeBCaptainName !== undefined ? str(body.tribeBCaptainName) : (existingRow?.tribeBCaptainName ?? null);

  // Derive phase from tribe data
  const phase = derivePhase(tribeAName, tribeAId, tribeBName, tribeBId);

  // Determine bothTribesReadyAt value
  // Auto-set when entering both_tribes_ready, clear when leaving
  let bothTribesReadyAt: Date | null;
  if (phase === "both_tribes_ready") {
    bothTribesReadyAt = existingRow?.bothTribesReadyAt ?? new Date();
  } else {
    bothTribesReadyAt = null;
  }

  const values = {
    id: "singleton" as const,
    phase,
    tribeAName,
    tribeAId,
    tribeACaptainName,
    tribeBName,
    tribeBId,
    tribeBCaptainName,
    activatedAt,
    bothTribesReadyAt,
    updatedAt: new Date(),
  };

  await db
    .insert(warActivation)
    .values(values)
    .onConflictDoUpdate({
      target: warActivation.id,
      set: {
        phase: values.phase,
        tribeAName: values.tribeAName,
        tribeAId: values.tribeAId,
        tribeACaptainName: values.tribeACaptainName,
        tribeBName: values.tribeBName,
        tribeBId: values.tribeBId,
        tribeBCaptainName: values.tribeBCaptainName,
        activatedAt: values.activatedAt,
        bothTribesReadyAt: values.bothTribesReadyAt,
        updatedAt: values.updatedAt,
      },
    });

  const rows = await db.select().from(warActivation).where(eq(warActivation.id, "singleton"));
  return c.json(rowToResponse(rows[0]));
});
