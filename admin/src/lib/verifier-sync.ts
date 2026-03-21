import type { AdminDraft, BatchPhaseConfigDraft, UpsertSystemConfigDraft } from "./types";

export interface NotifyPayload {
  warId?: number;
  txDigest?: string;
  reason?: string;
}

export interface EditorialDisplayPublishPayload {
  warId: number;
  phaseId: number | null;
  effectiveFromMs: number;
  reason?: string;
  systems: Array<{
    systemId: number;
    displayName: string;
    publicRuleText: string;
  }>;
}

export interface EditorialDisplayEntry {
  warId: number;
  phaseId: number | null;
  systemId: string;
  effectiveFromMs: number;
  updatedAtMs: number;
  displayName?: string;
  publicRuleText: string;
}

interface EditorialDisplaySystemInput {
  systemId: number;
  displayName: string;
  publicRuleText: string;
}

export function getVerifierUrl(): string {
  const configured = import.meta.env.VITE_VERIFIER_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "";
}

export function notifyVerifier(payload: NotifyPayload): void {
  const verifierUrl = getVerifierUrl();
  if (!verifierUrl) return;
  fetch(`${verifierUrl}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function buildEditorialDisplayPayload(input: {
  warId: number;
  phaseId: number | null;
  effectiveFromMs: number;
  reason?: string;
  systems: EditorialDisplaySystemInput[];
}): EditorialDisplayPublishPayload {
  return {
    warId: input.warId,
    phaseId: input.phaseId,
    effectiveFromMs: input.effectiveFromMs,
    ...(input.reason ? { reason: input.reason } : {}),
    systems: input.systems
      .map((system) => ({
        systemId: system.systemId,
        displayName: system.displayName.trim(),
        publicRuleText: system.publicRuleText.trim(),
      }))
      .filter((system) => Number.isFinite(system.systemId) && system.systemId > 0),
  };
}

export async function publishEditorialDisplay(payload: EditorialDisplayPublishPayload): Promise<void> {
  const verifierUrl = getVerifierUrl();
  if (!verifierUrl) {
    throw new Error("Verifier URL is unavailable.");
  }

  const response = await fetch(`${verifierUrl}/editorial-display`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Failed to publish editorial display copy (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Ignore body parse failures and fall back to the generic message.
    }
    throw new Error(message);
  }
}

export async function fetchEditorialDisplayEntries(warId: number): Promise<EditorialDisplayEntry[]> {
  const verifierUrl = getVerifierUrl();
  if (!verifierUrl) {
    return [];
  }

  const response = await fetch(`${verifierUrl}/editorial-display?warId=${warId}`, {
    cache: "no-store",
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch editorial display entries (${response.status})`);
  }

  const body = (await response.json()) as { entries?: EditorialDisplayEntry[] };
  return Array.isArray(body.entries) ? body.entries : [];
}

function buildBatchPhaseEditorialDisplayPayload(
  draft: BatchPhaseConfigDraft,
): EditorialDisplayPublishPayload | null {
  const warId = Number(draft.warId);
  if (!Number.isFinite(warId) || warId <= 0) return null;

  return buildEditorialDisplayPayload({
    warId,
    phaseId: draft.phaseNumber,
    effectiveFromMs: draft.effectiveFromMs,
    reason: draft.kind,
    systems: draft.systems.map((system) => ({
      systemId: system.systemId,
      displayName: system.displayName,
      publicRuleText: system.publicRuleText?.trim() ?? "",
    })),
  });
}

function buildUpsertSystemEditorialDisplayPayload(
  draft: UpsertSystemConfigDraft,
): EditorialDisplayPublishPayload {
  return buildEditorialDisplayPayload({
    warId: draft.warId,
    phaseId: null,
    effectiveFromMs: draft.effectiveFromMs,
    reason: draft.kind,
    systems: [
      {
        systemId: draft.systemId,
        displayName: draft.displayName,
        publicRuleText: draft.displayCopy.displayRuleDescription.trim(),
      },
    ],
  });
}

export function buildEditorialDisplayPayloadForDraft(
  draft: AdminDraft | null | undefined,
): EditorialDisplayPublishPayload | null {
  if (!draft) return null;

  switch (draft.kind) {
    case "batch-phase-config":
      return buildBatchPhaseEditorialDisplayPayload(draft);
    case "upsert-system-config":
      return buildUpsertSystemEditorialDisplayPayload(draft);
    default:
      return null;
  }
}
