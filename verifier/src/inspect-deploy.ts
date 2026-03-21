import "dotenv/config";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function main(): Promise<void> {
  const verbose = hasFlag("--verbose");
  const base = (getArg("--base") || process.env.LINEAGE_DEPLOY_BASE || "http://127.0.0.1:3001")
    .replace(/\/$/, "");
  const statusUrl = `${base}/status`;
  const latestUrl = `${base}/verifier/latest.json`;

  let status: unknown = null;
  let latest: unknown = null;
  let latestError: string | null = null;

  status = await fetchJson(statusUrl);
  try {
    latest = await fetchJson(latestUrl);
  } catch (error) {
    latestError = error instanceof Error ? error.message : String(error);
  }

  const statusWarId =
    status && typeof status === "object" && "warId" in status
      ? readFiniteNumber((status as { warId?: unknown }).warId)
      : null;
  const latestWarId =
    latest &&
    typeof latest === "object" &&
    "config" in latest &&
    (latest as { config?: { warId?: unknown } }).config
      ? readFiniteNumber((latest as { config?: { warId?: unknown } }).config?.warId)
      : null;

  const payload = {
    base,
    statusUrl,
    latestUrl,
    statusWarId: Number.isFinite(statusWarId) ? statusWarId : null,
    latestWarId: Number.isFinite(latestWarId) ? latestWarId : null,
    warIdsMatch:
      Number.isFinite(statusWarId) &&
      Number.isFinite(latestWarId) &&
      statusWarId === latestWarId,
    latestError,
    status,
    latest,
  };

  if (verbose) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const diagnostics =
    status &&
    typeof status === "object" &&
    "diagnostics" in status &&
    typeof (status as { diagnostics?: unknown }).diagnostics === "object" &&
    (status as { diagnostics?: Record<string, unknown> }).diagnostics
      ? (status as { diagnostics?: Record<string, unknown> }).diagnostics!
      : null;
  const latestArtifact =
    diagnostics &&
    typeof diagnostics.latestPublishedArtifact === "object" &&
    diagnostics.latestPublishedArtifact
      ? diagnostics.latestPublishedArtifact as Record<string, unknown>
      : null;
  const lastActivePhase =
    diagnostics &&
    typeof diagnostics.lastActivePhase === "object" &&
    diagnostics.lastActivePhase
      ? diagnostics.lastActivePhase as Record<string, unknown>
      : null;
  const configured =
    diagnostics &&
    typeof diagnostics.configured === "object" &&
    diagnostics.configured
      ? diagnostics.configured as Record<string, unknown>
      : null;
  const lastDiscoveryError =
    diagnostics &&
    typeof diagnostics.lastDiscoveryError === "object" &&
    diagnostics.lastDiscoveryError
      ? diagnostics.lastDiscoveryError as Record<string, unknown>
      : null;

  const summary = {
    base,
    verdict: payload.warIdsMatch ? "MATCH" : "MISMATCH",
    latestError,
    status: status && typeof status === "object"
      ? {
          state: (status as { state?: unknown }).state ?? null,
          warId: payload.statusWarId,
          tickRateMinutes: readFiniteNumber((status as { tickRateMinutes?: unknown }).tickRateMinutes),
          lastTickMs: readFiniteNumber((status as { lastTickMs?: unknown }).lastTickMs),
          nextTickMs: readFiniteNumber((status as { nextTickMs?: unknown }).nextTickMs),
        }
      : null,
    latest: latest && typeof latest === "object"
      ? {
          warId: payload.latestWarId,
          tickCount: readFiniteNumber(
            (latest as { config?: { tickCount?: unknown } }).config?.tickCount,
          ),
          tickStatus:
            typeof (latest as { tickStatus?: unknown }).tickStatus === "string"
              ? (latest as { tickStatus?: string }).tickStatus ?? null
              : null,
          systemCount:
            Array.isArray((latest as { scoreboard?: { systems?: unknown[] } }).scoreboard?.systems)
              ? (latest as { scoreboard?: { systems?: unknown[] } }).scoreboard?.systems?.length ?? 0
              : null,
          warName:
            typeof (latest as { scoreboard?: { warName?: unknown } }).scoreboard?.warName === "string"
              ? (latest as { scoreboard?: { warName?: string } }).scoreboard?.warName ?? null
              : null,
        }
      : null,
    diagnostics: diagnostics
      ? {
          packageIdLooksValid:
            typeof configured?.packageIdLooksValid === "boolean" ? configured.packageIdLooksValid : null,
          lastDiscoveryError:
            typeof lastDiscoveryError?.message === "string" ? lastDiscoveryError.message : null,
          activePhase:
            typeof lastActivePhase?.displayName === "string" ? lastActivePhase.displayName : null,
          activeSystems:
            Array.isArray(lastActivePhase?.activeSystemIds) ? lastActivePhase.activeSystemIds : [],
          latestPublishedArtifact: latestArtifact
            ? {
                warId: readFiniteNumber(latestArtifact.warId),
                tickCount: readFiniteNumber(latestArtifact.tickCount),
                systemCount: readFiniteNumber(latestArtifact.systemCount),
                tickStatus:
                  typeof latestArtifact.tickStatus === "string" ? latestArtifact.tickStatus : null,
              }
            : null,
        }
      : null,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
