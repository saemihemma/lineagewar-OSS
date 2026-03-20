import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AuditInputSummary,
  AuditScoreboardPoint,
  ResolvedTickResult,
  ScoreboardPayload,
  SystemDisplayConfig,
  TickAuditArtifact,
  TickAuditIndex,
  VerifierAuditSummary,
} from "./types.js";

const ARTIFACT_VERSION = 1;

async function atomicWriteFile(targetPath: string, data: string): Promise<void> {
  const tmpPath = targetPath + ".tmp";
  await writeFile(tmpPath, data, "utf8");
  await rename(tmpPath, targetPath);
}

type OutputEnvelope = {
  config: unknown;
  tickPlan: unknown;
  commitments: unknown;
  snapshots: unknown;
  scoreboard: ScoreboardPayload | null;
  systemDisplayConfigs?: SystemDisplayConfig[];
  audit: VerifierAuditSummary;
};

type AuditFilePaths = {
  indexPath: string;
  latestTickArtifactPath: string | null;
  tickArtifactPathsByTimestamp: Map<number, string>;
  receiptPathsByTimestamp: Map<number, string>;
  relativeIndexPath: string;
  relativeLatestTickArtifactPath: string | null;
};

function verifierVersion(): string {
  return process.env.LINEAGE_VERIFIER_VERSION || process.env.npm_package_version || "0.1.0";
}

function toPosixRelativePath(fromDirectory: string, targetPath: string): string {
  return path.relative(fromDirectory, targetPath).split(path.sep).join("/");
}

function buildAuditPaths(outputPath: string): AuditFilePaths {
  const outputDirectory = path.dirname(outputPath);
  const stem = path.basename(outputPath, path.extname(outputPath));
  const auditRoot = path.join(outputDirectory, "audit", stem);
  const ticksDirectory = path.join(auditRoot, "ticks");
  const receiptsDirectory = path.join(auditRoot, "receipts");
  const indexPath = path.join(auditRoot, "index.json");

  return {
    indexPath,
    latestTickArtifactPath: null,
    tickArtifactPathsByTimestamp: new Map<number, string>(),
    receiptPathsByTimestamp: new Map<number, string>(),
    relativeIndexPath: toPosixRelativePath(outputDirectory, indexPath),
    relativeLatestTickArtifactPath: null,
  };
}

export function deriveTickReceiptPath(inputPath: string, tickTimestampMs: number): string {
  const absoluteInputPath = path.resolve(process.cwd(), inputPath);
  const outputDirectory = path.dirname(absoluteInputPath);
  const stem = path.basename(absoluteInputPath, path.extname(absoluteInputPath));
  return path.join(outputDirectory, "audit", stem, "receipts", `${tickTimestampMs}.json`);
}

function scoreboardPointAtTick(scoreboard: ScoreboardPayload | null, tickTimestampMs: number): AuditScoreboardPoint | null {
  if (!scoreboard) {
    return null;
  }

  const chartPoint = scoreboard.chartData.find((entry) => entry.timestamp === tickTimestampMs);
  if (!chartPoint) {
    return null;
  }

  const tribeScores = scoreboard.chartSeries.map((series) => ({
    id: series.tribeId,
    name: series.name,
    color: series.color,
    points: Number(chartPoint[series.dataKey] ?? 0),
  }));

  return {
    tick: chartPoint.tick,
    timestamp: chartPoint.timestamp,
    tribeScores,
  };
}

function buildTickArtifact(
  tickTimestampMs: number,
  entries: ResolvedTickResult[],
  scoreboard: ScoreboardPayload | null,
  systemDisplayConfigs: SystemDisplayConfig[],
  sourceMode: string,
  inputs: AuditInputSummary,
  receiptPath: string,
): TickAuditArtifact {
  const orderedEntries = [...entries].sort((a, b) => a.snapshot.systemId - b.snapshot.systemId);
  const editorialBySystemId = new Map(systemDisplayConfigs.map((entry) => [entry.systemId, entry]));

  return {
    artifactVersion: ARTIFACT_VERSION,
    generatedAtMs: Date.now(),
    verifierVersion: verifierVersion(),
    sourceMode,
    tickTimestampMs,
    warId: orderedEntries[0]?.snapshot.warId ?? 0,
    tickPlan: orderedEntries.map((entry) => ({
      tickTimestampMs: entry.snapshot.tickTimestampMs,
      systemId: entry.snapshot.systemId,
    })),
    commitments: orderedEntries.map((entry) => entry.commitment),
    snapshots: orderedEntries.map((entry) => entry.snapshot),
    scoreboard: scoreboardPointAtTick(scoreboard, tickTimestampMs),
    inputs,
    systems: orderedEntries.map((entry) => ({
      systemId: entry.snapshot.systemId,
      snapshot: entry.snapshot,
      commitment: entry.commitment,
      resolution: entry.resolution,
      presenceRows: entry.presenceRows,
      candidateAssemblies: entry.assemblies,
      editorialDisplay: editorialBySystemId.get(String(entry.snapshot.systemId)) ?? null,
    })),
    receiptPath,
  };
}

function buildAuditIndex(
  outputDirectory: string,
  scoreboard: ScoreboardPayload | null,
  sourceMode: string,
  tickArtifacts: Array<{ tickTimestampMs: number; path: string; receiptPath: string; systemCount: number }>,
): TickAuditIndex {
  const latest = tickArtifacts.at(-1) ?? null;

  return {
    artifactVersion: ARTIFACT_VERSION,
    generatedAtMs: Date.now(),
    verifierVersion: verifierVersion(),
    sourceMode,
    latestTickMs: latest?.tickTimestampMs ?? null,
    availableTicks: tickArtifacts.map((entry) => ({
      tickTimestampMs: entry.tickTimestampMs,
      path: toPosixRelativePath(outputDirectory, entry.path),
      receiptPath: toPosixRelativePath(outputDirectory, entry.receiptPath),
      systemCount: entry.systemCount,
    })),
    trackedSystems: (scoreboard?.systems ?? []).map((system) => ({
      id: system.id,
      name: system.name,
    })),
    latestPath: latest ? toPosixRelativePath(outputDirectory, latest.path) : null,
  };
}

export function buildAuditSummary(
  outputPath: string | null,
  sourceMode: string,
  inputs: AuditInputSummary,
  latestTickArtifactPath?: string | null,
): VerifierAuditSummary {
  if (!outputPath) {
    return {
      artifactVersion: ARTIFACT_VERSION,
      generatedAtMs: Date.now(),
      verifierVersion: verifierVersion(),
      sourceMode,
      indexPath: null,
      latestTickArtifactPath: null,
      latestReceiptPath: null,
      inputs,
    };
  }

  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
  const outputDirectory = path.dirname(absoluteOutputPath);
  const paths = buildAuditPaths(absoluteOutputPath);
  const relativeLatestTickArtifactPath = latestTickArtifactPath
    ? toPosixRelativePath(outputDirectory, latestTickArtifactPath)
    : null;
  const latestReceiptPath = latestTickArtifactPath
    ? relativeLatestTickArtifactPath?.replace("/ticks/", "/receipts/")
    : null;

  return {
    artifactVersion: ARTIFACT_VERSION,
    generatedAtMs: Date.now(),
    verifierVersion: verifierVersion(),
    sourceMode,
    indexPath: paths.relativeIndexPath,
    latestTickArtifactPath: relativeLatestTickArtifactPath,
      latestReceiptPath: latestReceiptPath ?? null,
    inputs,
  };
}

export async function writeVerifierArtifacts(
  outputPath: string,
  envelopeWithoutAudit: Omit<OutputEnvelope, "audit">,
  sourceMode: string,
  inputs: AuditInputSummary,
  resolved: ResolvedTickResult[],
): Promise<VerifierAuditSummary> {
  const absoluteOutputPath = path.resolve(process.cwd(), outputPath);
  const outputDirectory = path.dirname(absoluteOutputPath);
  const paths = buildAuditPaths(absoluteOutputPath);
  const groupedByTick = new Map<number, ResolvedTickResult[]>();

  for (const entry of resolved) {
    const group = groupedByTick.get(entry.snapshot.tickTimestampMs) ?? [];
    group.push(entry);
    groupedByTick.set(entry.snapshot.tickTimestampMs, group);
  }

  const tickArtifacts: Array<{ tickTimestampMs: number; path: string; receiptPath: string; systemCount: number }> = [];
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await mkdir(path.dirname(paths.indexPath), { recursive: true });
  await mkdir(path.join(path.dirname(paths.indexPath), "ticks"), { recursive: true });
  await mkdir(path.join(path.dirname(paths.indexPath), "receipts"), { recursive: true });

  const sortedTicks = [...groupedByTick.keys()].sort((a, b) => a - b);
  for (const tickTimestampMs of sortedTicks) {
    const tickEntries = groupedByTick.get(tickTimestampMs) ?? [];
    const tickArtifactPath = path.join(path.dirname(paths.indexPath), "ticks", `${tickTimestampMs}.json`);
    const receiptPath = path.join(path.dirname(paths.indexPath), "receipts", `${tickTimestampMs}.json`);

    if (!existsSync(tickArtifactPath)) {
      const artifact = buildTickArtifact(
        tickTimestampMs,
        tickEntries,
        envelopeWithoutAudit.scoreboard,
        envelopeWithoutAudit.systemDisplayConfigs ?? [],
        sourceMode,
        inputs,
        toPosixRelativePath(outputDirectory, receiptPath),
      );
      await writeFile(tickArtifactPath, JSON.stringify(artifact, null, 2), "utf8");
    }

    tickArtifacts.push({
      tickTimestampMs,
      path: tickArtifactPath,
      receiptPath,
      systemCount: tickEntries.length,
    });
    paths.tickArtifactPathsByTimestamp.set(tickTimestampMs, tickArtifactPath);
    paths.receiptPathsByTimestamp.set(tickTimestampMs, receiptPath);
  }

  const latestTickArtifactPath = tickArtifacts.at(-1)?.path ?? null;
  const audit = buildAuditSummary(outputPath, sourceMode, inputs, latestTickArtifactPath);
  const envelope: OutputEnvelope = {
    ...envelopeWithoutAudit,
    audit,
  };

  await atomicWriteFile(absoluteOutputPath, JSON.stringify(envelope, null, 2));
  const index = buildAuditIndex(path.dirname(paths.indexPath), envelopeWithoutAudit.scoreboard, sourceMode, tickArtifacts);
  await atomicWriteFile(paths.indexPath, JSON.stringify(index, null, 2));

  return audit;
}
