import "dotenv/config";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

function parseOptionU64(field: unknown): number | null {
  if (field == null) return null;
  if (typeof field === "string" || typeof field === "number") {
    const n = Number(field);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof field === "object") {
    const vec = (field as { vec?: unknown[] }).vec;
    if (Array.isArray(vec) && vec.length > 0) {
      const n = Number(vec[0]);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return null;
}

export interface DiscoveredWarConfig {
  warId: number;
  warRegistryId: string;
  warDisplayName: string;
  warEnabled: boolean;
  warResolved: boolean;
  endedAtMs: number | null;
  winMargin: number;
  warConfigIds: string[];
  phaseConfigIds: string[];
  systemConfigIds: string[];
  warSystemIds: number[];
  participatingTribeIds: number[];
  tribeNames: Record<string, string>;
  defaultTickMinutes: number;
}

interface EventEntry {
  id?: { txDigest?: string };
  parsedJson?: Record<string, unknown>;
}

interface ObjectChange {
  type: string;
  objectId?: string;
  objectType?: string;
}

function extractCreatedByType(tx: unknown): Record<string, string[]> {
  const result = tx as { objectChanges?: ObjectChange[] };
  const byType: Record<string, string[]> = {};
  for (const change of result.objectChanges ?? []) {
    if (change.type !== "created" || !change.objectId) continue;
    const key = change.objectType ?? "unknown";
    byType[key] ??= [];
    byType[key].push(change.objectId);
  }
  return byType;
}

function findCreatedIdByTypeSuffix(byType: Record<string, string[]>, suffix: string): string | null {
  for (const [type, ids] of Object.entries(byType)) {
    if (type.includes(suffix) && ids.length > 0) return ids[0];
  }
  return null;
}

function findAllCreatedIdsByTypeSuffix(byType: Record<string, string[]>, suffix: string): string[] {
  const out: string[] = [];
  for (const [type, ids] of Object.entries(byType)) {
    if (type.includes(suffix)) out.push(...ids);
  }
  return out;
}

export async function discoverWarConfig(opts: {
  packageId: string;
  rpcUrl?: string;
  warId?: number | null;
}): Promise<DiscoveredWarConfig> {
  const rpcUrl = opts.rpcUrl || getJsonRpcFullnodeUrl("testnet");
  const client = new SuiJsonRpcClient({ url: rpcUrl, network: "testnet" });
  const pkg = opts.packageId;

  // 1. Discover the war + registry
  const warEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::registry::WarCreatedEvent` },
    order: "descending",
    limit: 50,
  });

  let targetEvent: EventEntry | null = null;
  let targetWarId = opts.warId ?? null;

  if (opts.warId != null) {
    for (const ev of (warEvents as { data?: EventEntry[] }).data ?? []) {
      const evWarId = Number(ev.parsedJson?.war_id);
      if (evWarId === opts.warId) { targetEvent = ev; targetWarId = evWarId; break; }
    }
  } else {
    const candidates: Array<{ ev: EventEntry; warId: number }> = [];
    for (const ev of (warEvents as { data?: EventEntry[] }).data ?? []) {
      const evWarId = Number(ev.parsedJson?.war_id);
      if (Number.isFinite(evWarId)) candidates.push({ ev, warId: evWarId });
    }
    candidates.sort((a, b) => b.warId - a.warId);

    for (const candidate of candidates) {
      const digest = candidate.ev.id?.txDigest;
      if (!digest) continue;
      const tx = await client.getTransactionBlock({ digest, options: { showObjectChanges: true } });
      const created = extractCreatedByType(tx);
      const regId = findCreatedIdByTypeSuffix(created, "::registry::WarRegistry");
      if (!regId) continue;
      const regObj = await client.getObject({ id: regId, options: { showContent: true } });
      const regFields = (regObj.data?.content as { fields?: Record<string, unknown> })?.fields ?? {};
      if (regFields.resolved === true) continue;
      targetEvent = candidate.ev;
      targetWarId = candidate.warId;
      break;
    }
  }

  if (!targetEvent || targetWarId == null) {
    throw new Error(
      opts.warId != null
        ? `No WarCreatedEvent found for war_id ${opts.warId}`
        : "No unresolved war found on chain",
    );
  }

  const txDigest = targetEvent.id?.txDigest;
  if (!txDigest) throw new Error("WarCreatedEvent missing txDigest");

  const tx = await client.getTransactionBlock({
    digest: txDigest,
    options: { showObjectChanges: true },
  });
  const created = extractCreatedByType(tx);
  const registryId = findCreatedIdByTypeSuffix(created, "::registry::WarRegistry");
  if (!registryId) throw new Error(`Could not extract WarRegistry ID from tx ${txDigest}`);

  // 2. Read registry state
  const regObj = await client.getObject({ id: registryId, options: { showContent: true } });
  const regFields = (regObj.data?.content as { fields?: Record<string, unknown> })?.fields ?? {};
  const warEnabled = regFields.enabled === true;
  const warResolved = regFields.resolved === true;
  const warEndedAtMs = parseOptionU64(regFields.ended_at_ms);
  const warWinMargin = Number(regFields.win_margin) || 1;
  const warDisplayName = String(regFields.display_name ?? `War ${targetWarId}`);

  // 3. Discover tribe IDs from TribeRegisteredEvent
  const tribeEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::registry::TribeRegisteredEvent` },
    order: "ascending",
    limit: 50,
  });
  const tribeIds: number[] = [];
  const tribeNames: Record<string, string> = {};
  for (const ev of (tribeEvents as { data?: EventEntry[] }).data ?? []) {
    const evWarId = Number(ev.parsedJson?.war_id);
    if (evWarId !== targetWarId) continue;
    const tid = Number(ev.parsedJson?.tribe_id);
    if (Number.isFinite(tid) && !tribeIds.includes(tid)) {
      tribeIds.push(tid);
      const name = ev.parsedJson?.display_name;
      if (typeof name === "string" && name) tribeNames[String(tid)] = name;
    }
  }

  // 4. Discover WarConfigVersion IDs
  const warConfigEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::config::WarConfigPublishedEvent` },
    order: "ascending",
    limit: 50,
  });
  const warConfigIds: string[] = [];
  let defaultTickMinutes = 60;
  for (const ev of (warConfigEvents as { data?: EventEntry[] }).data ?? []) {
    if (Number(ev.parsedJson?.war_id) !== targetWarId) continue;
    const digest = ev.id?.txDigest;
    if (!digest) continue;
    const evTx = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const evCreated = extractCreatedByType(evTx);
    const ids = findAllCreatedIdsByTypeSuffix(evCreated, "::config::WarConfigVersion");
    warConfigIds.push(...ids);
  }

  // Read tick rate from the latest WarConfigVersion object
  if (warConfigIds.length > 0) {
    const latestId = warConfigIds[warConfigIds.length - 1];
    const wcObj = await client.getObject({ id: latestId, options: { showContent: true } });
    const wcFields = (wcObj.data?.content as { fields?: Record<string, unknown> })?.fields;
    const parsed = Number(wcFields?.default_tick_minutes);
    if (Number.isFinite(parsed) && parsed > 0) defaultTickMinutes = parsed;
  }

  // 5. Discover PhaseConfig IDs
  const phaseEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::config::PhaseConfigPublishedEvent` },
    order: "ascending",
    limit: 50,
  });
  const phaseConfigIds: string[] = [];
  for (const ev of (phaseEvents as { data?: EventEntry[] }).data ?? []) {
    if (Number(ev.parsedJson?.war_id) !== targetWarId) continue;
    const digest = ev.id?.txDigest;
    if (!digest) continue;
    const evTx = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const evCreated = extractCreatedByType(evTx);
    const ids = findAllCreatedIdsByTypeSuffix(evCreated, "::config::PhaseConfig");
    phaseConfigIds.push(...ids);
  }

  // 6. Discover SystemConfigVersion IDs
  const sysEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::config::SystemConfigPublishedEvent` },
    order: "ascending",
    limit: 50,
  });
  const systemConfigIds: string[] = [];
  const warSystemIdSet = new Set<number>();
  for (const ev of (sysEvents as { data?: EventEntry[] }).data ?? []) {
    if (Number(ev.parsedJson?.war_id) !== targetWarId) continue;
    const sysId = Number(ev.parsedJson?.system_id);
    if (Number.isFinite(sysId) && sysId > 0) warSystemIdSet.add(sysId);
    const digest = ev.id?.txDigest;
    if (!digest) continue;
    const evTx = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const evCreated = extractCreatedByType(evTx);
    const ids = findAllCreatedIdsByTypeSuffix(evCreated, "::config::SystemConfigVersion");
    systemConfigIds.push(...ids);
  }

  return {
    warId: targetWarId,
    warRegistryId: registryId,
    warDisplayName,
    warEnabled,
    warResolved,
    endedAtMs: warEndedAtMs,
    winMargin: warWinMargin,
    warConfigIds,
    phaseConfigIds,
    systemConfigIds,
    warSystemIds: [...warSystemIdSet],
    participatingTribeIds: tribeIds,
    tribeNames,
    defaultTickMinutes,
  };
}

/**
 * Lightweight re-check of registry state and tick rate.
 * Used by the loop to detect mid-war changes without full re-discovery.
 */
export async function refreshWarState(opts: {
  packageId: string;
  rpcUrl: string;
  warId: number;
  warRegistryId: string;
  warConfigIds: string[];
  phaseConfigIds: string[];
}): Promise<{
  enabled: boolean;
  resolved: boolean;
  endedAtMs: number | null;
  winMargin: number;
  effectiveTickMinutes: number;
  warConfigIds: string[];
  phaseConfigIds: string[];
  systemConfigIds: string[];
  warSystemIds: number[];
}> {
  const client = new SuiJsonRpcClient({ url: opts.rpcUrl, network: "testnet" });

  // Read registry
  const regObj = await client.getObject({ id: opts.warRegistryId, options: { showContent: true } });
  const regFields = (regObj.data?.content as { fields?: Record<string, unknown> })?.fields ?? {};
  const enabled = regFields.enabled === true;
  const resolved = regFields.resolved === true;
  const endedAtMs = parseOptionU64(regFields.ended_at_ms);
  const winMargin = Number(regFields.win_margin) || 1;

  // Re-discover any new config IDs
  const pkg = opts.packageId;

  const warConfigEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::config::WarConfigPublishedEvent` },
    order: "ascending",
    limit: 50,
  });
  const freshWarConfigIds: string[] = [];
  for (const ev of (warConfigEvents as { data?: EventEntry[] }).data ?? []) {
    if (Number(ev.parsedJson?.war_id) !== opts.warId) continue;
    const digest = ev.id?.txDigest;
    if (!digest) continue;
    const evTx = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    freshWarConfigIds.push(...findAllCreatedIdsByTypeSuffix(extractCreatedByType(evTx), "::config::WarConfigVersion"));
  }

  const phaseEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::config::PhaseConfigPublishedEvent` },
    order: "ascending",
    limit: 50,
  });
  const freshPhaseConfigIds: string[] = [];
  for (const ev of (phaseEvents as { data?: EventEntry[] }).data ?? []) {
    if (Number(ev.parsedJson?.war_id) !== opts.warId) continue;
    const digest = ev.id?.txDigest;
    if (!digest) continue;
    const evTx = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    freshPhaseConfigIds.push(...findAllCreatedIdsByTypeSuffix(extractCreatedByType(evTx), "::config::PhaseConfig"));
  }

  const sysEvents = await client.queryEvents({
    query: { MoveEventType: `${pkg}::config::SystemConfigPublishedEvent` },
    order: "ascending",
    limit: 50,
  });
  const freshSystemConfigIds: string[] = [];
  const freshWarSystemIds = new Set<number>();
  for (const ev of (sysEvents as { data?: EventEntry[] }).data ?? []) {
    if (Number(ev.parsedJson?.war_id) !== opts.warId) continue;
    const sysId = Number(ev.parsedJson?.system_id);
    if (Number.isFinite(sysId) && sysId > 0) freshWarSystemIds.add(sysId);
    const digest = ev.id?.txDigest;
    if (!digest) continue;
    const evTx = await client.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    freshSystemConfigIds.push(...findAllCreatedIdsByTypeSuffix(extractCreatedByType(evTx), "::config::SystemConfigVersion"));
  }

  // Determine effective tick minutes from latest war config + phase override
  let tickMinutes = 60;
  if (freshWarConfigIds.length > 0) {
    const latestId = freshWarConfigIds[freshWarConfigIds.length - 1];
    const wcObj = await client.getObject({ id: latestId, options: { showContent: true } });
    const wcFields = (wcObj.data?.content as { fields?: Record<string, unknown> })?.fields;
    const parsed = Number(wcFields?.default_tick_minutes);
    if (Number.isFinite(parsed) && parsed > 0) tickMinutes = parsed;
  }

  if (freshPhaseConfigIds.length > 0) {
    const now = Date.now();
    const phaseObjects = await client.multiGetObjects({
      ids: freshPhaseConfigIds,
      options: { showContent: true },
    });
    let latestPhase: { effectiveFromMs: number; tickMinutesOverride: number | null } | null = null;
    for (const po of phaseObjects) {
      const fields = (po.data?.content as { fields?: Record<string, unknown> })?.fields;
      if (!fields) continue;
      const effectiveFromMs = Number(fields.effective_from_ms);
      const effectiveUntilMs = fields.effective_until_ms;
      const untilMs = effectiveUntilMs != null ? Number(effectiveUntilMs) : null;
      if (effectiveFromMs <= now && (untilMs == null || now < untilMs)) {
        if (!latestPhase || effectiveFromMs > latestPhase.effectiveFromMs) {
          const override = fields.tick_minutes_override;
          let tickOverride: number | null = null;
          if (override != null && typeof override === "object") {
            const vec = (override as { vec?: unknown[] }).vec;
            if (Array.isArray(vec) && vec.length > 0) tickOverride = Number(vec[0]);
          } else if (override != null) {
            tickOverride = Number(override);
          }
          latestPhase = {
            effectiveFromMs,
            tickMinutesOverride: Number.isFinite(tickOverride!) ? tickOverride : null,
          };
        }
      }
    }
    if (latestPhase?.tickMinutesOverride != null && latestPhase.tickMinutesOverride > 0) {
      tickMinutes = latestPhase.tickMinutesOverride;
    }
  }

  return {
    enabled,
    resolved,
    endedAtMs,
    winMargin,
    effectiveTickMinutes: tickMinutes,
    warConfigIds: freshWarConfigIds,
    phaseConfigIds: freshPhaseConfigIds,
    systemConfigIds: freshSystemConfigIds,
    warSystemIds: [...freshWarSystemIds],
  };
}
