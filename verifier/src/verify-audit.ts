import { readFile } from "node:fs/promises";
import path from "node:path";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { hashCanonicalSnapshot } from "./hash.js";
import { loadSnapshotEnvelope } from "./commit-manifest.js";
import { CanonicalSnapshot } from "./types.js";

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parseObjectFields(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object" || !("fields" in content)) {
    return null;
  }
  const fields = (content as { fields?: unknown }).fields;
  return fields && typeof fields === "object" && !Array.isArray(fields) ? (fields as Record<string, unknown>) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bytesToHex(value: unknown): string | null {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value : `0x${value}`;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) {
    return `0x${value.map((entry) => entry.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

function createdObjectIdsFromTransaction(result: unknown): string[] {
  const transaction = result as {
    objectChanges?: Array<{ type?: string; objectId?: string }>;
    effects?: { changedObjects?: Array<{ objectId?: string; idOperation?: string }> };
  };

  const fromObjectChanges = (transaction.objectChanges ?? [])
    .filter((change) => change.type === "created" && typeof change.objectId === "string")
    .map((change) => change.objectId as string);
  if (fromObjectChanges.length > 0) {
    return fromObjectChanges;
  }

  return (transaction.effects?.changedObjects ?? [])
    .filter((change) => change.idOperation === "Created" && typeof change.objectId === "string")
    .map((change) => change.objectId as string);
}

function findSnapshot(
  snapshots: CanonicalSnapshot[],
  systemId: number,
  tickTimestampMs: number,
): CanonicalSnapshot | null {
  return snapshots.find(
    (snapshot) => snapshot.systemId === systemId && snapshot.tickTimestampMs === tickTimestampMs,
  ) ?? null;
}

async function verifySnapshotObject(
  client: SuiJsonRpcClient,
  snapshot: CanonicalSnapshot,
  objectId: string,
): Promise<Record<string, unknown>> {
  const object = await client.getObject({
    id: objectId,
    options: { showContent: true, showType: true },
  });
  const fields = parseObjectFields(object.data?.content);
  if (!fields) {
    throw new Error(`Object ${objectId} did not expose snapshot fields`);
  }

  const expectedHash = hashCanonicalSnapshot(snapshot);
  const actualWarId = toNumber(fields.war_id);
  const actualSystemId = toNumber(fields.system_id);
  const actualTickTimestampMs = toNumber(fields.tick_timestamp_ms);
  const actualHash = bytesToHex(fields.snapshot_hash);

  return {
    objectId,
    systemId: snapshot.systemId,
    tickTimestampMs: snapshot.tickTimestampMs,
    expectedHash,
    actualHash,
    warIdMatches: actualWarId === snapshot.warId,
    systemMatches: actualSystemId === snapshot.systemId,
    tickMatches: actualTickTimestampMs === snapshot.tickTimestampMs,
    hashMatches: actualHash === expectedHash,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputPath =
    argValue(argv, "--input") ||
    process.env.LINEAGE_COMMIT_INPUT ||
    "../frontend/score/public/verifier/latest.json";
  const rpcUrl =
    argValue(argv, "--rpc-url") ||
    process.env.LINEAGE_SUI_RPC ||
    getJsonRpcFullnodeUrl("testnet");
  const receiptPath = argValue(argv, "--receipt");
  const txDigest = argValue(argv, "--tx-digest");
  const snapshotObjectId = argValue(argv, "--snapshot-object-id");
  const systemId = toNumber(argValue(argv, "--system-id"));
  const tickTimestampMs = toNumber(argValue(argv, "--tick-timestamp-ms"));

  const envelope = await loadSnapshotEnvelope(inputPath);
  const snapshots = envelope.snapshots ?? [];
  if (snapshots.length === 0) {
    throw new Error("No snapshots found in input payload.");
  }

  const client = new SuiJsonRpcClient({
    url: rpcUrl,
    network: "testnet",
  });

  const results: Record<string, unknown>[] = [];

  if (receiptPath) {
    const receipt = JSON.parse(await readFile(path.resolve(process.cwd(), receiptPath), "utf8")) as {
      results?: Array<{ systemId?: number; tickTimestampMs?: number; digest?: string }>;
    };

    for (const result of receipt.results ?? []) {
      if (!result.digest || typeof result.systemId !== "number" || typeof result.tickTimestampMs !== "number") {
        continue;
      }
      const snapshot = findSnapshot(snapshots, result.systemId, result.tickTimestampMs);
      if (!snapshot) {
        throw new Error(`Receipt referenced system ${result.systemId} tick ${result.tickTimestampMs}, but the artifact did not contain that snapshot.`);
      }
      const tx = await client.getTransactionBlock({
        digest: result.digest,
        options: { showObjectChanges: true, showEffects: true },
      });
      const createdObjectIds = createdObjectIdsFromTransaction(tx);
      let matched = false;
      for (const objectId of createdObjectIds) {
        const verification = await verifySnapshotObject(client, snapshot, objectId);
        if (verification.systemMatches && verification.tickMatches) {
          results.push({
            digest: result.digest,
            ...verification,
          });
          matched = true;
        }
      }
      if (!matched) {
        results.push({
          digest: result.digest,
          systemId: result.systemId,
          tickTimestampMs: result.tickTimestampMs,
          verified: false,
          error: "No created snapshot object matched the requested system/tick.",
        });
      }
    }
  } else if (snapshotObjectId) {
    if (systemId === null || tickTimestampMs === null) {
      throw new Error("--system-id and --tick-timestamp-ms are required with --snapshot-object-id");
    }
    const snapshot = findSnapshot(snapshots, systemId, tickTimestampMs);
    if (!snapshot) {
      throw new Error(`No artifact snapshot found for system ${systemId} tick ${tickTimestampMs}`);
    }
    results.push(await verifySnapshotObject(client, snapshot, snapshotObjectId));
  } else if (txDigest) {
    if (systemId === null || tickTimestampMs === null) {
      throw new Error("--system-id and --tick-timestamp-ms are required with --tx-digest");
    }
    const snapshot = findSnapshot(snapshots, systemId, tickTimestampMs);
    if (!snapshot) {
      throw new Error(`No artifact snapshot found for system ${systemId} tick ${tickTimestampMs}`);
    }
    const tx = await client.getTransactionBlock({
      digest: txDigest,
      options: { showObjectChanges: true, showEffects: true },
    });
    const createdObjectIds = createdObjectIdsFromTransaction(tx);
    let matched = false;
    for (const objectId of createdObjectIds) {
      const verification = await verifySnapshotObject(client, snapshot, objectId);
      if (verification.systemMatches && verification.tickMatches) {
        results.push({
          digest: txDigest,
          ...verification,
        });
        matched = true;
      }
    }
    if (!matched) {
      results.push({
        digest: txDigest,
        systemId,
        tickTimestampMs,
        verified: false,
        error: "No created snapshot object matched the requested system/tick.",
      });
    }
  } else {
    throw new Error("Provide either --receipt, --tx-digest, or --snapshot-object-id.");
  }

  console.log(
    JSON.stringify(
      {
        inputPath,
        rpcUrl,
        verifiedCount: results.filter((entry) => entry.hashMatches === true).length,
        resultCount: results.length,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error("Verify audit failed.");
  console.error(error);
  process.exit(1);
});
