import {
  CanonicalSnapshot,
  ScoreboardChartSeries,
  ScoreboardHistoryPoint,
  ScoreboardPayload,
  ScoreboardSystem,
  ScoreboardTribeScore,
  SnapshotCommitment,
  VerifierScenario,
} from "./types.js";

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
  scenario: VerifierScenario,
  snapshots: CanonicalSnapshot[],
  commitments: SnapshotCommitment[],
  tribeNameOverrides: Record<string, string> = {},
  chartWindowSize?: number,
): ScoreboardPayload {
  const resolvedTribeNames = {
    ...scenario.tribeNames,
    ...tribeNameOverrides,
  };
  const tribeIds = [...new Set(snapshots.flatMap((snapshot) => snapshot.presenceRows.map((row) => row.tribeId)))]
    .sort((a, b) => a - b);

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
      name: String(snapshot.systemId),
      state: stateToNumber(snapshot.state),
      controller: snapshot.controllerTribeId ?? undefined,
      pointsPerTick: snapshot.explanation.pointsPerTick,
    }));

  const displayChartData = chartWindowSize ? chartData.slice(-chartWindowSize) : chartData;
  const tickRateMinutes =
    chartData.length >= 2
      ? Math.max(0, (chartData[chartData.length - 1].timestamp - chartData[chartData.length - 2].timestamp) / 60_000)
      : undefined;

  return {
    warName: scenario.warName,
    lastTickMs: chartData[chartData.length - 1]?.timestamp as number,
    tickRateMinutes: tickRateMinutes && tickRateMinutes > 0 ? tickRateMinutes : undefined,
    tribeScores,
    systems,
    chartData: displayChartData,
    chartSeries,
    commitments,
    snapshots,
  };
}
