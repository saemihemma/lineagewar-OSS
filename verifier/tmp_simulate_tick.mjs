import "dotenv/config";
import { RegistryBackedVerifierDataSource } from "./src/registry-source.js";
import { discoverWarConfig } from "./src/discover-war-config.js";
import { resolveTick } from "./src/resolver.js";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const pkg = process.env.LINEAGE_PACKAGE_ID;
const rpcUrl = process.env.LINEAGE_SUI_RPC || getJsonRpcFullnodeUrl("testnet");
const gqlUrl = process.env.LINEAGE_SUI_GRAPHQL_URL || null;

const d = await discoverWarConfig({ packageId: pkg, rpcUrl, warId: 13 });
console.log("War:", d.warId, "Systems:", d.warSystemIds, "Tribes:", d.participatingTribeIds);

const config = {
  warId: 13, tickStartMs: Date.now(), tickCount: 1, phaseStatusWithheld: false,
  phaseEndMs: null, phaseLabel: null, warEndMs: null, outputJson: false,
  source: "registry", scenario: "two-tribe-two-system", outputPath: "",
  systemDisplayConfigPath: null,
  chain: {
    rpcUrl, warRegistryId: d.warRegistryId, warConfigIds: d.warConfigIds,
    phaseConfigIds: d.phaseConfigIds, systemConfigIds: d.systemConfigIds,
    activeSystemIds: [], warSystemIds: d.warSystemIds,
    participatingTribeIds: d.participatingTribeIds, packageId: pkg,
    adminCapId: null, assemblyRegistryPath: null, assemblyObjectIds: [],
    ownerTribeRegistryPath: null, locationMappingPath: null,
    assemblySystemMappingPath: null, graphqlUrl: gqlUrl,
    locationQueryMode: "auto",
    locationEventType: process.env.LINEAGE_LOCATION_EVENT_TYPE || 
      (process.env.LINEAGE_WORLD_PACKAGE_ID 
        ? `${process.env.LINEAGE_WORLD_PACKAGE_ID}::location::LocationRevealedEvent`
        : null),
    locationEventsPageSize: 50, locationEventsMaxPages: 20,
    worldPackageId: process.env.LINEAGE_WORLD_PACKAGE_ID ?? null,
    worldTenant: process.env.LINEAGE_WORLD_TENANT ?? null,
    assemblyDiscoveryMode: "off",
  },
};

const ds = new RegistryBackedVerifierDataSource(config);

console.log("\n=== Refreshing location events ===");
const added = await ds.refreshLocationMappingsFromEvents();
console.log("Added:", added);

console.log("\n=== Promoting discovered assemblies ===");
const promoted = ds.promoteDiscoveredAssemblyIds();
console.log("Promoted:", promoted);

console.log("\n=== Getting candidate assemblies for system 30000005 ===");
const candidates = await ds.getCandidateAssemblies(30000005, Date.now());
console.log("Candidates:", candidates.length);
for (const c of candidates) {
  console.log("  id:", c.assemblyId.slice(0, 16) + "...");
  console.log("  tribeId:", c.tribeId);
  console.log("  systemId:", c.systemId);
  console.log("  status:", c.status);
  console.log("  assemblyTypeId:", c.assemblyTypeId);
  console.log("  assemblyFamily:", c.assemblyFamily);
}

if (candidates.length === 0) {
  console.log("\n!!! NO CANDIDATES - checking why !!!");
  
  // Check registryEntries
  console.log("registryEntries count:", ds["registryEntries"]?.length);
  for (const e of ds["registryEntries"] ?? []) {
    console.log("  entry:", e.objectId.slice(0, 16) + "...");
  }
  
  // Check systemIdByAssemblyId
  console.log("systemIdByAssemblyId size:", ds["systemIdByAssemblyId"]?.size);
  for (const [k, v] of ds["systemIdByAssemblyId"] ?? []) {
    console.log("  mapping:", k.slice(0, 16) + "... ->", v);
  }
}

console.log("\n=== Resolving tick ===");
const tick = { tickTimestampMs: Date.now(), systemId: 30000005 };
try {
  const result = await resolveTick(ds, tick);
  console.log("State:", result.snapshot.state);
  console.log("Points:", result.snapshot.pointsAwarded);
  console.log("Presence rows:", result.presenceRows);
} catch (e) {
  console.error("Resolve failed:", e.message);
}
