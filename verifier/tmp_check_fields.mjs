const GQL = "https://graphql.testnet.sui.io/graphql";
const ASM = "0xe8c13a707b0bd025b69cbea6021b94b02debfa5fa3c3b654d838f3f9a99385da";

const r = await fetch(GQL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    query: `{ a0: object(address: "${ASM}") { asMoveObject { contents { json type { repr } } } } }`,
  }),
});
const j = await r.json();
const json = j.data?.a0?.asMoveObject?.contents?.json;
const typeRepr = j.data?.a0?.asMoveObject?.contents?.type?.repr;

console.log("typeRepr:", typeRepr);
console.log("type_id:", json?.type_id);
console.log("status:", json?.status);
console.log("owner_cap_id:", json?.owner_cap_id);
console.log("All keys:", Object.keys(json ?? {}));

// The critical check: does type_id exist and is it a number?
const typeId = json?.type_id;
console.log("\ntype_id value:", typeId, "type:", typeof typeId);
console.log("Number(type_id):", Number(typeId));
console.log("Number.isFinite:", Number.isFinite(Number(typeId)));
