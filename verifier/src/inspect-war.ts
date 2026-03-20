import "dotenv/config";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { discoverWarConfig } from "./discover-war-config.js";

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const packageId = process.env.LINEAGE_PACKAGE_ID;
  if (!packageId || packageId === "0x0") {
    throw new Error("LINEAGE_PACKAGE_ID must be set.");
  }

  const rpcUrl = process.env.LINEAGE_SUI_RPC || getJsonRpcFullnodeUrl("testnet");
  const rawWarId = getArg("--war");
  const warId = rawWarId != null ? Number(rawWarId) : null;

  const discovered = await discoverWarConfig({
    packageId,
    rpcUrl,
    warId: Number.isFinite(warId) ? warId : null,
  });

  console.log(JSON.stringify({
    rpcUrl,
    packageId,
    warId: discovered.warId,
    warRegistryId: discovered.warRegistryId,
    warDisplayName: discovered.warDisplayName,
    warEnabled: discovered.warEnabled,
    warResolved: discovered.warResolved,
    endedAtMs: discovered.endedAtMs,
    winMargin: discovered.winMargin,
    defaultTickMinutes: discovered.defaultTickMinutes,
    participatingTribes: discovered.participatingTribeIds.map((tribeId) => ({
      tribeId,
      name: discovered.tribeNames[String(tribeId)] ?? null,
    })),
    warSystemIds: discovered.warSystemIds,
    warConfigIds: discovered.warConfigIds,
    phaseConfigIds: discovered.phaseConfigIds,
    systemConfigIds: discovered.systemConfigIds,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
