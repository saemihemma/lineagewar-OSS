import {
  CanonicalSnapshot,
  ScoreboardChartSeries,
  ScoreboardHistoryPoint,
  ScoreboardPayload,
  ScoreboardSystem,
  ScoreboardTribeScore,
  SystemDisplayConfig,
  SnapshotCommitment,
} from "./types.js";

export interface ScoreboardMetadata {
  warName: string;
  tribeNames: Record<string, string>;
}

export interface ScoreboardBuildOptions {
  chartWindowSize?: number;
  tickRateMinutes?: number;
  systemDisplayConfigs?: SystemDisplayConfig[];
}

const TRIBE_COLORS = [
  "var(--tribe-a)",
  "var(--tribe-b)",
  "var(--contested)",
  "#34d399",
  "#a78bfa",
  "#f59e0b",
];

function stateToNumber(state: CanonicalSnapshot["state"]): number {
  if (state === "NEUTRAL") {
    return 0;
  }
  if (state === "CONTESTED") {
    return 1;
  }
  return 2;
}

export function buildScoreboardPayload(
  metadata: ScoreboardMetadata,
  snapshots: CanonicalSnapshot[],
  commitments: SnapshotCommitment[],
  participatingTribeIds: number[] = [],
  options: ScoreboardBuildOptions = {},
): ScoreboardPayload {
  const { chartWindowSize, tickRateMinutes: explicitTickRateMinutes, systemDisplayConfigs = [] } = options;
  const resolvedTribeNames = { ...metadata.tribeNames };
  const displayNameBySystemId = new Map(
    systemDisplayConfigs
      .map((config) => [String(config.systemId), config.displayName?.trim() ?? ""] as const)
      .filter((entry) => entry[1].length > 0),
  );
  const tribeIds = [...new Set([
    ...participatingTribeIds,
    ...snapshots.flatMap((snapshot) => snapshot.presenceRows.map((row) => row.tribeId)),
    ...snapshots.flatMap((snapshot) => snapshot.pointsAwarded.map((award) => award.tribeId)),
  ])].sort((a, b) => a - b);

  const chartSeries: ScoreboardChartSeries[] = tribeIds.map((tribeId, index) => ({
    tribeId,
    dataKey: `tribe_${tribeId}`,
    name: resolvedTribeNames[String(tribeId)] ?? `Tribe ${tribeId}`,
    color: TRIBE_COLORS[index % TRIBE_COLORS.length],
  }));

  const totals = new Map<number, number>(tribeIds.map((tribeId) => [tribeId, 0]));
  const snapshotsByTick = new Map<number, CanonicalSnapshot[]>();

  for (const snapshot of snapshots) {
    const atTick = snapshotsByTick.get(snapshot.tickTimestampMs) ?? [];
    atTick.push(snapshot);
    snapshotsByTick.set(snapshot.tickTimestampMs, atTick);
  }

  const chartData: ScoreboardHistoryPoint[] = [...snapshotsByTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tickTimestampMs, tickSnapshots], index) => {
      for (const snapshot of tickSnapshots) {
        for (const award of snapshot.pointsAwarded) {
          totals.set(award.tribeId, (totals.get(award.tribeId) ?? 0) + award.points);
        }
      }

      const point: ScoreboardHistoryPoint = {
        tick: index + 1,
        timestamp: tickTimestampMs,
      };

      for (const series of chartSeries) {
        point[series.dataKey] = totals.get(series.tribeId) ?? 0;
      }

      return point;
    });

  const tribeScores: ScoreboardTribeScore[] = chartSeries.map((series) => ({
    id: series.tribeId,
    name: series.name,
    points: totals.get(series.tribeId) ?? 0,
    color: series.color,
  }));

  const latestBySystem = new Map<number, CanonicalSnapshot>();
  for (const snapshot of snapshots) {
    const existing = latestBySystem.get(snapshot.systemId);
    if (!existing || existing.tickTimestampMs < snapshot.tickTimestampMs) {
      latestBySystem.set(snapshot.systemId, snapshot);
    }
  }

  const systems: ScoreboardSystem[] = [...latestBySystem.values()]
    .sort((a, b) => a.systemId - b.systemId)
    .map((snapshot) => ({
      id: String(snapshot.systemId),
      name: displayNameBySystemId.get(String(snapshot.systemId)) || String(snapshot.systemId),
      state: stateToNumber(snapshot.state),
      controller: snapshot.controllerTribeId ?? undefined,
      pointsPerTick: snapshot.explanation.pointsPerTick,
    }));

  const displayChartData = chartWindowSize ? chartData.slice(-chartWindowSize) : chartData;
  const tickRateMinutes = explicitTickRateMinutes && explicitTickRateMinutes > 0
    ? explicitTickRateMinutes
    : chartData.length >= 2
      ? Math.max(0, (chartData[chartData.length - 1].timestamp - chartData[chartData.length - 2].timestamp) / 60_000)
      : undefined;
  const latestTickTimestamp = chartData[chartData.length - 1]?.timestamp ?? null;
  const latestSnapshot = latestTickTimestamp == null
    ? null
    : snapshots
      .filter((snapshot) => snapshot.tickTimestampMs === latestTickTimestamp)
      .sort((a, b) => a.systemId - b.systemId)[0] ?? null;

  return {
    warName: metadata.warName,
    lastTickMs: chartData[chartData.length - 1]?.timestamp ?? null,
    tickRateMinutes: tickRateMinutes && tickRateMinutes > 0 ? tickRateMinutes : undefined,
    tickStatus: latestSnapshot?.resolutionMetadata.tickStatus,
    degradedReason: latestSnapshot?.resolutionMetadata.degradedReason ?? null,
    carriedForwardFromTickMs: latestSnapshot?.resolutionMetadata.carriedForwardFromTickMs ?? null,
    statusMessage: latestSnapshot?.resolutionMetadata.tickStatus === "degraded_frozen"
      ? "GraphQL ownership resolution failed; showing carried-forward state."
      : undefined,
    tribeScores,
    systems,
    chartData: displayChartData,
    chartSeries,
    commitments,
    snapshots,
  };
}
