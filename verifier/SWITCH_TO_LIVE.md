# Switch to Live (Stillness)

This document tracks what is bootstrapped during testing, what is already live-backed,
and exactly what needs to change when going live on Stillness.

---

## 1. Current Test Setup (What is faked)

### Assembly Object IDs

Synthetic object IDs in `registry/war9-live-assemblies.json`:

```
0x000000000000000000000000000000000000000000000000000000000009a001
```

These do not exist on chain. The `RegistryBackedVerifierDataSource` calls `multiGetObjects`
on them, gets nothing useful back, and falls back to the bootstrap fields in the manifest.

### Assembly-to-System Location

Static `bootstrapSystemId` fields in the manifest. No chain reads, no location events.

### Owner-to-Tribe Mapping

Hardcoded in `registry/war9-owner-tribes.json` with synthetic character IDs and two
test tribes (100 = Tribe Red, 200 = Tribe Blue).

### What IS Real (even during testing)

- **War / Phase / System configs**: Auto-discovered from chain events by `war9-loop.ts`
- **Tick rate**: Read from on-chain `WarConfigVersion.default_tick_minutes`
- **Score persistence**: PostgreSQL `committed_ticks_v2` table via `TickLedger`
- **Audit artifacts**: Full `ResolvedTickResult` per tick under `audit/latest/ticks/`
- **Tick boundaries**: Dynamically computed from `earliestEffectiveFromMs`

---

## 2. Architecture Overview

### Entry Point

`war9-loop.ts` is the live entry point. It runs continuously (30s loop) and:

1. Discovers `WarConfigVersion`, `PhaseConfig`, `SystemConfigVersion` from chain events
2. Reads `default_tick_minutes` from the `WarConfigVersion` object
3. Computes dynamic tick boundaries aligned to clean hourly marks
4. Loads committed ticks from PostgreSQL (immutable historical scores)
5. Resolves only NEW ticks using `RegistryBackedVerifierDataSource`
6. Commits new ticks to the database
7. Writes the scoreboard payload + audit artifacts

### Data Source

`RegistryBackedVerifierDataSource` extends `OnChainConfigVerifierDataSource`:

- **Config**: Read from chain via `SuiJsonRpcClient` (war config, phase, system config)
- **Assemblies**: Fetched via `multiGetObjects` using object IDs from the assembly registry
- **Location**: Resolved by `resolveSystemLocation` with this priority:
  1. Live `system_id` field on the on-chain assembly object
  2. `assembly-system-mapping` manifest (from `fetch-location-events.ts`)
  3. `location_hash` to `systemId` mapping
  4. Bootstrap `systemId` fallback
- **Owner/Tribe**: Resolved by `TribeResolver` from the owner-tribes manifest

### Score Persistence

`TickLedger` writes to PostgreSQL `committed_ticks_v2`. Each row stores the full
`ResolvedTickResult` (snapshot, commitment, presence rows, assemblies) for a unique
`(war_id, system_id, tick_timestamp_ms)`. Uses `ON CONFLICT DO NOTHING` so historical
scores are immutable -- a tick is computed once and never recalculated.

### Tick Timing

- Tick rate read from `WarConfigVersion.default_tick_minutes` (validated to clean
  divisors of 60: 15, 20, 30, 60)
- First tick aligned to the next clean boundary after `earliestEffectiveFromMs`
- Phase start does NOT trigger an immediate tick; scoring waits for the next boundary
- Committed ticks in DB are never affected by future config/world state changes

---

## 3. Going Live: The Tick Resolution Flow

This is the target architecture for live. Everything happens at tick time:

```
Tick boundary arrives (e.g., 10:00 UTC)
  |
  +-- Already committed in DB? --> Skip (score is immutable)
  |
  +-- NEW tick:
       |
       +-- 1. Fetch assembly objects from chain (multiGetObjects)
       |      Returns: owner, status, type_id, system_id, location_hash, inventory
       |
       +-- 2. Resolve location for each assembly
       |      Priority: live system_id > location event mapping > location_hash > bootstrap
       |
       +-- 3. Resolve owner -> character -> tribe
       |      Target: on-chain character -> tribe resolution
       |      Interim: owner-tribes manifest
       |
       +-- 4. Apply phase/system config rules (from chain)
       |      Filter by family, type, storage, inventory requirements
       |
       +-- 5. Build presence rows, resolve control, create canonical snapshot
       |
       +-- 6. Commit to PostgreSQL (immutable)
       |
       +-- 7. Write scoreboard + audit artifacts
```

No cron jobs. No external batch scripts. Everything resolves from chain state at
tick time inside the verifier loop.

---

## 4. Going Live: Assembly Discovery

### Replace Synthetic Object IDs

The `war9-live-assemblies.json` manifest contains fake object IDs. For live:

- Populate with **real assembly object IDs** from Stillness deployment
- The `RegistryBackedVerifierDataSource` will call `multiGetObjects` and get real
  chain data back (status, type_id, owner, location_hash, system_id, inventory)
- Bootstrap fields become fallbacks rather than the primary data source

### Location Resolution Strategy

**Target (Option C -- preferred):** If live assembly objects on Stillness expose a
`system_id` field directly, `resolveSystemLocation` already reads it as priority 1.
No mapping files needed. This is the cleanest path.

**Interim (Option A -- if system_id is not available):** Integrate location event
queries into the verifier loop. Before resolving a tick, query recent
`LocationRevealedEvent` events to build an in-memory assembly-to-system mapping.
This keeps everything inside the loop with no external dependencies.

**`fetch-location-events.ts` is a bootstrap/testing tool only.** It generates static
JSON mapping files that go stale as assemblies move. Do NOT use it as the live
location strategy. It remains useful for:

- Initial bootstrapping of known assembly positions
- Debugging and inspection
- Generating `system-names.stillness.json` for display names

### Environment Variables

```bash
# Assembly registry with real object IDs
LINEAGE_ASSEMBLY_REGISTRY_PATH=registry/live-assemblies.stillness.json

# Only if using Option A (location event mapping as interim)
LINEAGE_ASSEMBLY_SYSTEM_MAPPING_PATH=registry/generated/assembly-system-mapping.stillness.json

# Location hash mapping (legacy bridge, optional)
LINEAGE_LOCATION_MAPPING_PATH=registry/location-hashes.stillness.json
```

---

## 5. Going Live: Owner-to-Tribe Resolution

### Current State

`war9-owner-tribes.json` maps synthetic `ownerCharacterId` values to test tribe IDs.

### Target State

The intended live ownership chain is:

```
assembly object -> owner field -> Character object -> tribe_id field
```

The `RegistryBackedVerifierDataSource.materializeCandidate` already reads
`ownerCharacterId` from live object fields when available (via `parseOwnerCharacterId`).
The remaining gap is `characterId -> tribeId`, which currently comes from the
owner-tribes manifest.

### Interim

Generate a real owner-tribes manifest with actual player character IDs and their
tribe assignments:

```bash
LINEAGE_OWNER_TRIBE_REGISTRY_PATH=registry/owner-tribes.stillness.json
LINEAGE_PARTICIPATING_TRIBE_IDS=<real tribe IDs, comma-separated>
```

### Replace Later

When the on-chain `Character` object exposes `tribe_id` directly, update
`TribeResolver` to query it from chain instead of reading the manifest.

---

## 6. Going Live: Database

Score persistence is **critical infrastructure**. Without it, scores reset on
verifier restart.

```bash
# Public PostgreSQL connection string (reachable from the deployment host)
DATABASE_PUBLIC_URL=postgresql://user:pass@host:port/db

# Or if deploying on Railway with internal networking:
DATABASE_URL=postgresql://user:pass@postgres.railway.internal:5432/railway
```

### Important

- The `committed_ticks_v2` table is auto-created by `TickLedger.ensureTable()`
- **Clear the table when starting a fresh war** or after major manifest changes
  that invalidate historical tick data
- Each row stores the full `ResolvedTickResult` as JSONB for complete auditability
- `ON CONFLICT DO NOTHING` ensures historical scores are never overwritten

---

## 7. Going Live: Frontend

### Score App (public scoreboard)

```bash
# Enable the public war page
VITE_ENABLE_WAR_PAGE=1

# Verifier output URL (where the scoreboard JSON is served)
VITE_LIVE_VERIFIER_SNAPSHOT_URL=/verifier/latest.json

# Poll interval (ms) -- 0 disables polling
VITE_LIVE_VERIFIER_POLL_INTERVAL_MS=60000

# World API for system name resolution
VITE_WORLD_API_URL=https://world-api-stillness.live.tech.evefrontier.com
```

### Admin App

```bash
VITE_WORLD_API_URL=https://world-api-stillness.live.tech.evefrontier.com
VITE_WAR_REGISTRY_ID=<live war registry object ID>
VITE_ADMIN_ALLOWLIST=<admin wallet addresses, comma-separated>
```

---

## 8. Going Live: Verifier Runtime

```bash
# Core identity
LINEAGE_SOURCE=registry
LINEAGE_WAR_ID=<war number>
LINEAGE_PACKAGE_ID=<lineage_war package ID>
LINEAGE_WAR_REGISTRY_ID=<war registry object ID>
LINEAGE_SUI_RPC=https://fullnode.testnet.sui.io:443

# Assembly and tribe data
LINEAGE_ASSEMBLY_REGISTRY_PATH=registry/live-assemblies.stillness.json
LINEAGE_OWNER_TRIBE_REGISTRY_PATH=registry/owner-tribes.stillness.json
LINEAGE_PARTICIPATING_TRIBE_IDS=<tribe IDs>

# Location events (for bootstrap/system name generation)
LINEAGE_SUI_GRAPHQL_URL=https://sui-testnet.mystenlabs.com/graphql
LINEAGE_LOCATION_EVENT_TYPE=0x353988e063b4683580e3603dbe9e91fefd8f6a06263a646d43fd3a2f3ef6b8c1::location::LocationRevealedEvent
LINEAGE_WORLD_API_BASE=https://world-api-stillness.live.tech.evefrontier.com

# Score persistence
DATABASE_PUBLIC_URL=postgresql://user:pass@host:port/db

# Loop config
LINEAGE_LOOP_INTERVAL_SECONDS=30
```

### Tick Rate

Reads from chain `WarConfigVersion.default_tick_minutes`. Validated to clean
divisors of 60 (15, 20, 30, 60). If the on-chain value is not a clean divisor,
falls back to 60 with a warning.

Phase-level `tick_minutes_override` is also supported by the tick planner.

---

## 9. Cutover Checklist

### Data Sources

- [ ] `LINEAGE_ASSEMBLY_REGISTRY_PATH` contains real assembly object IDs
- [ ] `LINEAGE_OWNER_TRIBE_REGISTRY_PATH` contains real character-to-tribe mappings
- [ ] `LINEAGE_PARTICIPATING_TRIBE_IDS` matches actual participating tribes
- [ ] Location resolution strategy decided:
  - [ ] Option C: live `system_id` on assembly objects (preferred)
  - [ ] Option A: location event query at tick time (interim)
  - [ ] Bootstrap only: `bootstrapSystemId` in manifest (testing only)

### Chain Config

- [ ] `LINEAGE_PACKAGE_ID` points at the live lineage_war package
- [ ] `LINEAGE_WAR_REGISTRY_ID` points at the live war registry
- [ ] War config published with correct `default_tick_minutes`
- [ ] Phase config published with correct system IDs and rules
- [ ] System configs published for all active systems

### Database

- [ ] `DATABASE_PUBLIC_URL` configured and reachable from deployment host
- [ ] `committed_ticks_v2` table cleared for fresh war start
- [ ] Verified: verifier log shows "Tick ledger: connected to PostgreSQL"

### Verifier

- [ ] Run `war9-loop.ts --once` and confirm:
  - [ ] Correct tick rate in log (e.g., `tick=60min`)
  - [ ] Correct system IDs discovered
  - [ ] New ticks committed to DB
  - [ ] Scoreboard JSON written with correct tribe names and scores
  - [ ] Audit artifacts generated under `audit/latest/ticks/`
- [ ] Start continuous loop and confirm ticks accumulate correctly

### Frontend

- [ ] `VITE_ENABLE_WAR_PAGE=1`
- [ ] `VITE_LIVE_VERIFIER_SNAPSHOT_URL` pointing at verifier output
- [ ] `VITE_WORLD_API_URL` set for system name resolution
- [ ] Scoreboard renders with system names (not raw IDs)
- [ ] Audit page loads and tick drill-down works
- [ ] System detail pages show correct names and control history

---

## 10. Rollback Plan

If live ingestion is unstable:

1. Kill the verifier loop
2. Set `VITE_ENABLE_WAR_PAGE=0` on frontend deployment
3. Revert assembly registry to bootstrap manifest
4. DB data is safe -- committed ticks are immutable and can be inspected
5. Re-run with `--once` to verify stable state before restarting loop

---

## 11. Audit Provenance Labels

The verifier emits explicit provenance labels into public audit artifacts. These
indicate where each piece of data came from:

| Label | Meaning |
|-------|---------|
| `registry_live_object` | Assembly data from a real Sui object read |
| `registry_entry_bootstrap` | Assembly data from bootstrap manifest fields |
| `live_system_id` | System assignment from live `system_id` field on object |
| `assembly_system_mapping_manifest` | System from `fetch-location-events.ts` output |
| `location_hash_bootstrap_mapping` | System from `location_hash` -> `systemId` bridge |
| `bootstrap_system_id` | System from `bootstrapSystemId` in manifest |
| `live_object_owner` | Owner character from live object owner field |
| `bootstrap_owner_character` | Owner from `bootstrapOwnerCharacterId` in manifest |
| `owner_tribe_registry_manifest` | Tribe from owner-tribes JSON manifest |
| `live_object_fields` | Assembly type/status from live chain fields |
| `registry_bootstrap` | Assembly metadata from bootstrap manifest fields |

When going live, you should see `registry_live_object`, `live_system_id`, and
`live_object_owner` replacing bootstrap labels. If bootstrap labels persist,
the corresponding live data source is not yet available.
