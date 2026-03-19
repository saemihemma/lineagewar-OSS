# The Lineage War -- Product Specification

## Overview

The Lineage War is a competitive territorial control game built on the Sui blockchain within the EVE Frontier virtual world. Tribes compete for control of solar systems by deploying smart assemblies (network nodes, storage units, turrets, gates). A verifier service scores the war continuously, and when it ends, the result is permanently recorded on chain.

## Core Concepts

**War** -- A single competition between registered tribes, with a defined start, phases, systems, and an optional scheduled end. Each war has a unique ID and a `WarRegistry` object on chain.

**Tribes** -- EVE Frontier player groups identified by tribe ID. Two or more tribes are registered as participants in a war. Only registered tribes can score points.

**Systems** -- Solar systems (e.g. 30000005) where scoring takes place. Assemblies deployed in these systems determine who controls them.

**Assemblies** -- On-chain smart objects (network nodes, storage units, turrets, gates) deployed by players. Each assembly has an owner traced through: Assembly -> OwnerCap -> Wallet -> Character -> Tribe.

**Phases** -- Time-bounded configuration periods within a war. Each phase defines which systems are active, the tick rate, and scoring rules. Phases are cumulative -- Phase 2 adds to Phase 1's scores, never replaces them.

**Ticks** -- Scoring intervals (15, 30, or 60 minutes). At each tick, the verifier queries on-chain state to determine which tribe controls each system and awards points.

## War Lifecycle

### 1. Create War

The admin creates a war from the admin panel (`Setup` screen):

- War ID: unique integer
- Display name / slug: for identification
- Max supported tribes: capacity
- Win margin: score gap required for a decisive victory (e.g. 20 points). If the leading tribe's margin is less than this, the result is a DRAW.
- Source of truth mode: always "Verifier required" (value 2)

On chain: creates a `WarRegistry` (shared object) and a `WarAdminCap` (transferred to the admin's wallet).

### 2. Register Tribes

From the admin panel (`Overview` screen), register each participating tribe:

- Enter the EVE Frontier tribe ID (e.g. 98000423)
- The World API auto-fills the display name
- Each registration creates a `TribeKey` dynamic field on the registry

Only registered tribes can score points. Assemblies owned by non-registered tribes are discovered but don't contribute to scoring.

### 3. Publish Phase Configuration

From the admin panel (`Phases` screen), configure a phase:

- Phase number: sequential (1, 2, 3...)
- Activation time: snapped to the next tick boundary for clean alignment
- Tick rate: 15, 30, or 60 minutes (war-wide, not per-system)
- Systems: one or more solar system IDs with per-system scoring rules

Per-system rules:

- Points per tick: how many points the controller earns each tick
- Take margin: presence advantage needed to take control from neutral/another tribe
- Hold margin: presence advantage needed to maintain control
- Assembly type filters: which assembly types count (e.g. only network nodes)
- Storage requirements: optional item-in-storage rules

A single transaction publishes: `WarConfigVersion` + `PhaseConfig` + `SystemConfigVersion` per system + `WarSystem` registration + assembly rules.

### 4. Verifier Discovers and Scores

The verifier auto-discovers the war from chain events:

- `WarCreatedEvent` -> finds the war and registry
- `TribeRegisteredEvent` -> finds participating tribes
- `WarConfigPublishedEvent` -> finds tick rate and defaults
- `PhaseConfigPublishedEvent` -> finds phase boundaries
- `SystemConfigPublishedEvent` -> finds system configs and active system IDs

Per-tick scoring:

1. Query `LocationRevealedEvent` events to find assemblies in war systems
2. For each assembly, resolve ownership via 3-batch GraphQL pipeline (assembly -> owner cap -> wallet -> character -> tribe)
3. Evaluate assembly against system rules (type filter, storage requirements)
4. Group assemblies by tribe, compute presence scores
5. Determine system state:
   - CONTROLLED: one tribe meets the take/hold margin -> they get `pointsPerTick`
   - CONTESTED: tribes are too close, no one gets points
   - NEUTRAL: no qualifying assemblies present
6. Commit the tick result to PostgreSQL ledger
7. Write `latest.json` for the frontend scoreboard

Scores are cumulative and permanent. The ledger is the authoritative history. Tick rate changes between phases do not recalculate historical scores.

### 5. Phase Transitions

When the admin publishes a new phase:

- The verifier detects the config change on the next cycle
- New systems are added to `warSystemIds`, location queries expand
- Tick rate changes take effect for future ticks only
- Historical scores from previous phases are preserved

Systems can be added or removed between phases. Removed systems stop being scored (tick planner excludes them) but their historical scores remain.

### 6. Schedule War End

From the admin panel (`Debug` screen):

- Schedule war end: sets a future `ended_at_ms` on the registry
- Update end time: changes the scheduled end
- Cancel scheduled end: clears `ended_at_ms`, war continues

The admin does NOT need to be online at the exact end time.

### 7. Auto-Resolution

When `now >= ended_at_ms`, the verifier:

1. Runs a final tick covering all ticks up to the end time (no ticks scored after it)
2. Computes total scores per registered tribe from the full ledger
3. Determines outcome based on `win_margin`:
   - If top tribe leads by >= `win_margin` -> VICTORY, that tribe is the winner
   - If margin < `win_margin` -> DRAW, no winner
4. Submits `resolve_war` transaction to Sui:
   - Creates a permanent `WarResolution` object with tribe scores, winner, and outcome
   - Sets `resolved = true` on the `WarRegistry`
5. Writes `resolution.json` with the on-chain object ID
6. Exits (or polls for the next unresolved war if in auto-discover mode)

### 8. On-Chain Artifacts

After resolution, anyone can query:

- `WarRegistry`: war metadata, `resolved: true`, `ended_at_ms`
- `WarResolution`: tribe scores, `victor_tribe_id`, `outcome` (victory/draw), `win_margin_at_resolution`
- `WarConfigVersion`: tick rate and scoring defaults
- `PhaseConfig`: phase boundaries
- `SystemConfigVersion`: per-system scoring rules
- `WinMarginRecord`: historical win margin changes
- `TribeScore`: per-tribe scores within the resolution

## System Architecture

```
Admin Panel (React) ---wallet-signed txs---> Sui Blockchain
       |                                           |
       |--- POST /notify --->  Verifier (Node.js)  |
                                   |               |
                                   |-- GraphQL ----|
                                   |-- RPC --------|
                                   |
                                   v
                              PostgreSQL (tick ledger)
                                   |
                                   v
                              latest.json
                                   |
                                   v
                           Scoreboard (React)
```

**Admin Panel**: Creates wars, registers tribes, publishes phases, schedules war end. All via wallet-signed transactions. Calls `POST /notify` on the verifier after creating a war.

**Verifier**: Continuously scores the war. Discovers everything from chain events. Persists tick results to PostgreSQL. Writes scoreboard JSON. Auto-resolves on chain at war end. Exposes `GET /status` and `POST /notify` HTTP endpoints.

**Scoreboard Frontend**: Reads `latest.json` and displays live scores, charts, system states.

**PostgreSQL**: Stores committed tick results. The authoritative scoring history. Keyed by `(war_id, system_id, tick_timestamp_ms)`.

## Deployment

Single Railway service running the verifier process. The verifier also serves the built admin panel (at `/admin/`) and scoreboard frontend (at `/`) as static files. One port, one service.

Required env vars:

- `LINEAGE_PACKAGE_ID` -- deployed contract
- `LINEAGE_SUI_RPC` / `LINEAGE_SUI_GRAPHQL_URL` -- Sui endpoints
- `LINEAGE_WORLD_PACKAGE_ID` -- for location event discovery
- `DATABASE_PUBLIC_URL` -- PostgreSQL
- `LINEAGE_ADMIN_PRIVATE_KEY` -- for on-chain auto-resolution
