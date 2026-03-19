import { readFile } from "node:fs/promises";
import path from "node:path";
import { CanonicalSnapshot, SnapshotCommitment } from "./types.js";
import { hashCanonicalSnapshot } from "./hash.js";

export type SnapshotEnvelope = {
  snapshots?: CanonicalSnapshot[];
  commitments?: SnapshotCommitment[];
};

export type CommitManifestEntry = {
  target: string;
  adminCapId: string;
  args: {
    warId: number;
    systemId: number;
    tickTimestampMs: number;
    state: number;
    controllerTribeId: number | null;
    pointsAwarded: number;
    configVersionId: string;
    snapshotHashHex: string | null;
  };
  note: string;
};

export function controlStateToU8(state: CanonicalSnapshot["state"]): number {
  if (state === "NEUTRAL") return 0;
  if (state === "CONTESTED") return 1;
  return 2;
}

export function pointsTotal(snapshot: CanonicalSnapshot): number {
  return snapshot.pointsAwarded.reduce((sum, item) => sum + item.points, 0);
}

export function latestSnapshotsPerSystem(snapshots: CanonicalSnapshot[]): CanonicalSnapshot[] {
  const latest = new Map<number, CanonicalSnapshot>();
  for (const snapshot of snapshots) {
    const existing = latest.get(snapshot.systemId);
    if (!existing || existing.tickTimestampMs < snapshot.tickTimestampMs) {
      latest.set(snapshot.systemId, snapshot);
    }
  }
  return [...latest.values()].sort((a, b) => a.systemId - b.systemId);
}

export async function loadSnapshotEnvelope(inputPath: string): Promise<SnapshotEnvelope> {
  return JSON.parse(
    await readFile(path.resolve(process.cwd(), inputPath), "utf8"),
  ) as SnapshotEnvelope;
}

export function buildCommitManifest(
  packageId: string,
  adminCapId: string,
  envelope: SnapshotEnvelope,
): CommitManifestEntry[] {
  const snapshots = envelope.snapshots ?? [];
  const commitments = envelope.commitments ?? [];

  if (snapshots.length === 0) {
    throw new Error("No snapshots found in input payload");
  }

  return latestSnapshotsPerSystem(snapshots).map((snapshot) => {
    if (!snapshot.config.systemConfigObjectId) {
      throw new Error(
        `Snapshot for system ${snapshot.systemId} is missing config.systemConfigObjectId. Re-run the verifier with chain or registry config inputs before preparing commit transactions.`,
      );
    }

    const commitment = commitments.find(
      (entry) =>
        entry.systemId === snapshot.systemId && entry.tickTimestampMs === snapshot.tickTimestampMs,
    );
    const recomputedSnapshotHash = hashCanonicalSnapshot(snapshot);

    if (commitment?.snapshotHash && commitment.snapshotHash !== recomputedSnapshotHash) {
      throw new Error(
        `Snapshot hash mismatch for system ${snapshot.systemId} at tick ${snapshot.tickTimestampMs}: commitment=${commitment.snapshotHash}, recomputed=${recomputedSnapshotHash}`,
      );
    }

    return {
      target: `${packageId}::admin::commit_snapshot_record`,
      adminCapId,
      args: {
        warId: snapshot.warId,
        systemId: snapshot.systemId,
        tickTimestampMs: snapshot.tickTimestampMs,
        state: controlStateToU8(snapshot.state),
        controllerTribeId: snapshot.controllerTribeId,
        pointsAwarded: pointsTotal(snapshot),
        configVersionId: snapshot.config.systemConfigObjectId,
        snapshotHashHex: commitment?.snapshotHash ?? recomputedSnapshotHash,
      },
      note: "Built from the latest per-system verifier snapshots with a recomputed canonical hash check.",
    };
  });
}
