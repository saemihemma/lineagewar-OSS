import "dotenv/config";

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

async function main(): Promise<void> {
  const base = (getArg("--base") || process.env.LINEAGE_DEPLOY_BASE || "http://127.0.0.1:3001").replace(/\/$/, "");
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
    status && typeof status === "object" && "warId" in status ? Number((status as { warId?: unknown }).warId) : null;
  const latestWarId =
    latest &&
    typeof latest === "object" &&
    "config" in latest &&
    (latest as { config?: { warId?: unknown } }).config
      ? Number((latest as { config?: { warId?: unknown } }).config?.warId)
      : null;

  console.log(JSON.stringify({
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
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
