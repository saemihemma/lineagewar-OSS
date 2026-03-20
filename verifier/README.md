# Lineage War Verifier

TypeScript scoring engine for the Lineage War. Reads on-chain config and assembly state, resolves control per system, commits hourly snapshot records on-chain.

## Target model

1. Discover relevant assemblies
2. Resolve assembly → character
3. Resolve character → tribe
4. Score by tribe ID
5. Use names only as display metadata

## Goals

- Lock the canonical presence and snapshot schemas.
- Prove stable snapshot hashing.
- Prove tick planning from config.
- Prove deterministic control resolution.
- Keep the collector boundary explicit so chain/world integrations can be added incrementally.

## Pipeline

1. Load verifier config
2. Build a tick plan
3. Collect candidate assemblies for each active system
4. Resolve qualifying presence by tribe
5. Resolve control state
6. Build canonical snapshots
7. Hash the canonical snapshot payload

## Scripts

- `npm run demo` — seeded scenario demo
- `npm run demo:chain` — chain-backed config + seeded assemblies
- `npm run demo:registry` — chain config + live object registry
- `npm run import:spawned-world` — convert builder-scaffold deployments to verifier format
- `npm run collect:location-events` — collect LocationRevealedEvent records from Sui
- `npm run prepare:commit` — pre-flight check for snapshot commits
- `npm run submit:commit` — send Sui transactions (add `--execute` to submit)
- `npm run verify:audit` — prove public artifact matches chain
- `npm run check` — type check
- `npm run build` — compile

## Setup

```bash
cp .env.example .env  # fill in your values
npm install
npm run demo
```

## Source modes

### Seeded (`LINEAGE_SOURCE=seeded`)

Uses local scenario data for deterministic testing. No chain connection needed.

### Chain (`LINEAGE_SOURCE=chain`)

Reads Lineage War config objects from Sui RPC while using seeded assemblies.

Required env vars: `LINEAGE_SUI_RPC`, `LINEAGE_WAR_REGISTRY_ID`

### Registry (`LINEAGE_SOURCE=registry`)

Chain-backed config reads with tribe-first live object fetch from Sui.

Required env vars: `LINEAGE_SUI_RPC`, `LINEAGE_WAR_REGISTRY_ID`, `LINEAGE_SYSTEM_CONFIG_IDS`

See `.env.example` for the full list of optional registry paths and config overrides.

## Spawned-world import bridge

Converts builder-scaffold world deployments to verifier-ready registry manifests.

```bash
npm run import:spawned-world -- --network=testnet --overlay=registry/spawned-world-import.example.json
```

Reads from `repos/world-contracts/test-resources.json` and deployment artifacts. Writes manifests to `registry/generated/`.

## Snapshot commits

`prepare:commit` reads a verifier output JSON and prints a manifest of `commit_snapshot_record` calls needed.

`submit:commit` builds real Sui transactions. By default performs a dry run — add `--execute` to submit.

Required: `LINEAGE_PACKAGE_ID`, `LINEAGE_ADMIN_CAP_ID`, `LINEAGE_SUI_PRIVATE_KEY` (for submit only).

## Audit artifacts

Each verifier run writes a public audit tree:

- `audit/<feed>/index.json`
- `audit/<feed>/ticks/<tickTimestampMs>.json`
- `audit/<feed>/receipts/<tickTimestampMs>.json` (after submit)

Use `npm run verify:audit` to compare published artifacts against on-chain snapshot records.

## Location event collector

Collects `LocationRevealedEvent` records and produces assembly→system mappings.

```bash
npm run collect:location-events
```

See `.env.example` for optional env vars (`LINEAGE_LOCATION_QUERY_MODE`, `LINEAGE_SUI_GRAPHQL_URL`, etc.).
