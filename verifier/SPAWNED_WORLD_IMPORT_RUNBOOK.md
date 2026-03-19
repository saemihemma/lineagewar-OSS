# Spawned World Import Runbook

This runbook covers the `testnet`-first hybrid path:

1. create or reuse a real spawned Frontier world on `testnet`
2. copy the world artifacts into `builder-scaffold`
3. generate verifier registry inputs from those world artifacts
4. run the existing verifier and score frontend without changing the scoring core

## What Requires Keys

These steps require user-provided keys and funded accounts:

- `pnpm deploy-world testnet`
- `pnpm configure-world testnet`
- `pnpm create-test-resources testnet`
- any follow-on world mutation scripts such as:
  - `create-character`
  - `create-storage-unit`
  - `create-gates`
  - `ssu-online`
  - `online-gates`
  - storage-unit item movement scripts such as `game-item-to-chain` and `withdraw-deposit`

Those entrypoints are declared in `repos/world-contracts/package.json`.

The builder host flow also makes the signer requirement explicit:

- you need the same keys available in Sui keytool, `world-contracts/.env`, and `builder-scaffold/.env`
- for `testnet`, those accounts must be funded before deploy/configure/seed

## What Does Not Require Keys

These are read-only or local processing steps:

- generating registry JSON from existing world artifacts
- reading testnet objects through the verifier
- generating verifier snapshots and audit files
- rendering the score frontend from verifier JSON

## Phase 1: Prove The Spawned World Substrate

From `repos/world-contracts`:

```bash
cp env.example .env
# Fill in testnet keys and addresses.
pnpm install
pnpm deploy-world testnet
pnpm configure-world testnet
pnpm create-test-resources testnet
```

Artifacts expected after this phase:

- `repos/world-contracts/deployments/testnet/extracted-object-ids.json`
- `repos/world-contracts/test-resources.json`

From `repos/world-contracts`, copy the world metadata into `builder-scaffold`:

```bash
NETWORK=testnet
mkdir -p ../builder-scaffold/deployments/$NETWORK/
cp -r deployments/* ../builder-scaffold/deployments/
cp test-resources.json ../builder-scaffold/test-resources.json
```

That proves:

- the world exists on testnet
- you have the signer story working
- the shared object IDs and seeded resource IDs are available locally

## Phase 2: Generate Verifier Registry Inputs

The new verifier bridge script is:

- `verifier/src/import-spawned-world.ts`

It reads:

- `repos/world-contracts/test-resources.json`
- `repos/world-contracts/deployments/<network>/extracted-object-ids.json`
  - or the copied `builder-scaffold` version if that exists instead
- a small overlay file that declares the war-specific metadata not present in the raw world artifacts:
  - which characters belong to which tribes
  - which assemblies belong to which systems
  - any fallback inventory/status metadata the verifier should carry

Example overlay:

- `verifier/registry/spawned-world-import.example.json`

Run from `verifier`:

```bash
npm run import:spawned-world -- --network=testnet --overlay=registry/spawned-world-import.example.json
```

Generated outputs:

- `verifier/registry/generated/spawned-testnet-live-assemblies.json`
- `verifier/registry/generated/spawned-testnet-owner-tribes.json`
- `verifier/registry/generated/spawned-testnet-summary.json`

The summary file includes the recommended verifier env vars:

- `LINEAGE_SOURCE=registry`
- `LINEAGE_ASSEMBLY_REGISTRY_PATH=...`
- `LINEAGE_OWNER_TRIBE_REGISTRY_PATH=...`
- `LINEAGE_ACTIVE_SYSTEM_IDS=...`

## Why The Overlay Exists

The raw spawned-world artifacts are not enough by themselves to score a war yet.

`test-resources.json` and `extracted-object-ids.json` tell us:

- package IDs
- shared registry IDs
- seeded item IDs

But they do not fully encode:

- tribe membership for the Lineage War
- which solar system each war-relevant assembly should count toward
- the larger authored-war population beyond the tiny default starter set

The overlay is the smallest bridge that turns spawned-world data into verifier-ready inputs without
rewriting the verifier.

## Current Import Bridge Behavior

The bridge can derive real object IDs for the default seeded starter set using:

- `objectRegistry`
- `world.packageId`
- the seeded `itemId` values from `test-resources.json`

That is enough for the proof step around:

- the seeded Smart Character objects
- the seeded Smart Storage Unit
- the seeded two Smart Gates

For any larger authored war population beyond that starter set, the overlay should provide explicit
`itemId` or `objectId` values until a richer discovery/import layer exists.

## Phase 3: Run The Existing Verifier Unchanged

Once the registry inputs are generated, run the current verifier in `registry` mode with chain-backed
config plus the generated assembly and owner manifests.

The important point is that these pieces stay unchanged:

- `verifier/src/resolver.ts`
- `verifier/src/tick-planner.ts`
- `verifier/src/hash.ts`
- `verifier/src/canonicalize.ts`
- the snapshot commit/audit pipeline
- the score frontend’s verifier envelope consumption
- the admin transaction model

Only the candidate collection/import layer changes.

## Phase 4: Expand Into The Full Three-System War

After the proof step works on testnet, extend the world-authoring and overlay flow to support the real
three-system war:

- `30020691`: storage rule plus item requirement
- `30017227`: gates only
- `30005277`: gates plus storage

This next phase will require additional world mutation scripts because `create-test-resources` only
creates a tiny starter set.

That follow-on work should add:

- more characters if needed
- more gates and storage units
- item deposits for storage-rule systems
- location publication or system assignment inputs for the target systems

## Current Constraint

`builder-scaffold/docs/building-on-existing-world.md` is still marked `Coming soon`, so there is no
finished one-command “existing world import” flow to lean on yet.

That is why this runbook deliberately uses:

- the existing `world-contracts` deploy/configure/seed scripts
- the existing builder copy step
- a small verifier-side import bridge

instead of assuming the missing workflow already exists.
