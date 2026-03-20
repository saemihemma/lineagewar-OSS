import {
  PhaseConfig,
  TickPlanEntry,
  VerifierDataSource,
} from "./types.js";

function alignTick(timestampMs: number, tickMinutes: number): number {
  const tickMs = tickMinutes * 60_000;
  return Math.floor(timestampMs / tickMs) * tickMs;
}

function phaseIncludesSystem(phase: PhaseConfig | null, systemId: number): boolean {
  if (!phase) {
    return false;
  }
  return phase.activeSystemIds.includes(systemId);
}

export async function buildTickPlan(
  dataSource: VerifierDataSource,
  tickStartMs: number,
  tickCount: number,
  warEndMs?: number | null,
): Promise<TickPlanEntry[]> {
  const now = warEndMs != null && warEndMs < Date.now() ? warEndMs : Date.now();
  const warConfig = await dataSource.getWarConfigAt(now);
  const phase = await dataSource.getActivePhaseAt(now);
  const defaultTickMinutes = phase?.tickMinutesOverride ?? warConfig.defaultTickMinutes;
  const alignedNow = alignTick(now, defaultTickMinutes);
  const alignedStart = alignedNow - Math.max(0, tickCount - 1) * defaultTickMinutes * 60_000;

  const entries: TickPlanEntry[] = [];

  for (let index = 0; index < tickCount; index += 1) {
    const tickTimestampMs = alignedStart + index * defaultTickMinutes * 60_000;
    if (warEndMs != null && tickTimestampMs >= warEndMs) {
      break;
    }
    const phaseAtTick = await dataSource.getActivePhaseAt(tickTimestampMs);
    if (!phaseAtTick || tickTimestampMs < phaseAtTick.effectiveFromMs) {
      continue;
    }
    if (phaseAtTick.effectiveUntilMs != null && tickTimestampMs >= phaseAtTick.effectiveUntilMs) {
      continue;
    }
    const activeSystemsAtTick = phaseAtTick.activeSystemIds;

    for (const systemId of activeSystemsAtTick) {
      if (!phaseIncludesSystem(phaseAtTick, systemId)) {
        continue;
      }
      entries.push({ tickTimestampMs, systemId });
    }
  }

  return entries;
}
