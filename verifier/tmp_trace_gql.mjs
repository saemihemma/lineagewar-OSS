const GQL = "https://graphql.testnet.sui.io/graphql";

async function gql(query) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors?.length) console.log("GQL ERRORS:", j.errors.map(e => e.message));
  return j.data;
}

// The assembly in system 30000005 for War 13
const ASSEMBLY_ID = "0xe8c13a707b0bd025b69cbea6021b94b02debfa5fa3c3b654d838f3f9a99385da";

console.log("=== Step 1: Assembly object (Batch 1) ===");
const asmData = await gql(`{
  a0: object(address: "${ASSEMBLY_ID}") {
    address
    asMoveObject {
      contents {
        json
        type { repr }
      }
    }
    owner {
      __typename
      ... on AddressOwner { address { address } }
      ... on Shared { initialSharedVersion }
    }
  }
}`);

const asmObj = asmData?.a0;
const asmJson = asmObj?.asMoveObject?.contents?.json;
const asmType = asmObj?.asMoveObject?.contents?.type?.repr;
const ownerCapId = asmJson?.owner_cap_id;

console.log("  Type:", asmType);
console.log("  owner_cap_id:", ownerCapId);
console.log("  Owner __typename:", asmObj?.owner?.__typename);

if (!ownerCapId) {
  console.log("  FAIL: No owner_cap_id found on assembly");
  process.exit(1);
}

console.log("\n=== Step 2: OwnerCap object (Batch 2) ===");
const capData = await gql(`{
  c0: object(address: "${ownerCapId}") {
    asMoveObject {
      contents { json }
    }
    owner {
      __typename
      ... on AddressOwner { address { address } }
    }
  }
}`);

const capObj = capData?.c0;
const wallet = capObj?.owner?.address?.address;

console.log("  OwnerCap owner __typename:", capObj?.owner?.__typename);
console.log("  Wallet address:", wallet);

if (!wallet) {
  console.log("  FAIL: No wallet address found on OwnerCap");
  console.log("  Full cap response:", JSON.stringify(capObj, null, 2));
  process.exit(1);
}

console.log("\n=== Step 3: Character object (Batch 3) ===");
const charData = await gql(`{
  ch0: object(address: "${wallet}") {
    asMoveObject {
      contents { json }
    }
  }
}`);

const charObj = charData?.ch0;
const charJson = charObj?.asMoveObject?.contents?.json;
const tribeId = charJson?.tribe_id;

console.log("  tribe_id:", tribeId);
console.log("  Character found:", charObj !== null && charObj !== undefined);

if (!tribeId) {
  console.log("  FAIL: No tribe_id found");
  console.log("  Full char response:", JSON.stringify(charObj, null, 2));
}

console.log("\n=== Summary ===");
console.log(`  Assembly: ${ASSEMBLY_ID.slice(0,16)}...`);
console.log(`  OwnerCap: ${ownerCapId}`);
console.log(`  Wallet: ${wallet}`);
console.log(`  Tribe ID: ${tribeId}`);
console.log(`  Result: ${tribeId ? "WOULD SCORE FOR TRIBE " + tribeId : "NEUTRAL (no tribe)"}`);

// Run it 5 times to check consistency
console.log("\n=== Consistency check (5 runs) ===");
for (let i = 0; i < 5; i++) {
  const d = await gql(`{
    a: object(address: "${ASSEMBLY_ID}") {
      asMoveObject { contents { json } }
    }
  }`);
  const j = d?.a?.asMoveObject?.contents?.json;
  const cap = j?.owner_cap_id;
  console.log(`  Run ${i+1}: owner_cap_id=${cap ? "found" : "NULL"}`);
}
