import { buildCommitManifest, loadSnapshotEnvelope } from "./commit-manifest.js";

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputPath =
    argValue(argv, "--input") ||
    process.env.LINEAGE_COMMIT_INPUT ||
    "../frontend/score/public/verifier/live.json";
  const packageId = argValue(argv, "--package-id") || process.env.LINEAGE_PACKAGE_ID;
  const adminCapId = argValue(argv, "--admin-cap-id") || process.env.LINEAGE_ADMIN_CAP_ID;

  if (!packageId || !adminCapId) {
    throw new Error("LINEAGE_PACKAGE_ID and LINEAGE_ADMIN_CAP_ID are required to prepare commit calls");
  }

  const envelope = await loadSnapshotEnvelope(inputPath);
  const manifest = buildCommitManifest(packageId, adminCapId, envelope).map((entry) => ({
    ...entry,
    note: "This is a commit-call manifest scaffold. The submit script can now dry-run or execute these entries.",
  }));

  console.log(JSON.stringify({ inputPath, packageId, adminCapId, manifest }, null, 2));
}

main().catch((error: unknown) => {
  console.error("Prepare commit manifest failed.");
  console.error(error);
  process.exit(1);
});
