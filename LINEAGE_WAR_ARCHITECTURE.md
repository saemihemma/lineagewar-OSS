# Lineage War — Architecture Document

**Document role:** Architecture + code navigation for agents working on the Lineage War system.
**Priority of truth:** Deployed contract > this document > local Move source files.
**Blockchain:** Sui (Move 2024 edition) · **Status:** Live on testnet

---

## 1. What This Is

The Lineage War is a competitive territorial control game within EVE Frontier. Player groups (tribes) fight for control of solar systems by deploying smart assemblies — network nodes, storage units, turrets, and gates. An off-chain verifier continuously reads on-chain state to score who controls what, and when the war ends, the final result is permanently recorded on chain as an immutable `WarResolution` object.

This is the core competitive event system for EVE Frontier. Wars are admin-operated (created, configured, ended by a game operator) but scored autonomously by the verifier with full audit trail.

**Core Stack:**
- **On-chain:** Move modules in `lineage_war` package (registry, admin, config, rules, events, etc.)
- **Off-chain:** Verifier (Node.js/TypeScript, single Railway service)
- **Frontend:** Admin panel (React) + Scoreboard (React), both served as static files by the verifier
- **Database:** PostgreSQL (tick ledger — authoritative scoring history)
- **Contracts:** Move sources in `contracts/sources/` (self-contained, deployable independently)

**Who Uses It:**
1. Admin (React panel): creates wars, registers tribes, publishes phases, schedules end
2. Verifier (background): discovers from chain events, scores each tick, auto-resolves
3. Players (React scoreboard): watch live scores and system control states

---

## 2. System Architecture

```
Admin Panel (React) ──wallet txs──> Sui Blockchain
       │                                    │
       │── POST /notify ──> Verifier ───────┤ (JSON-RPC: events, objects)
                               │            │ (GraphQL: assembly ownership)
                               │
                               ├── PostgreSQL (tick ledger)
                               │
                               └── latest.json ──> Scoreboard (React)
```

**Verifier** is the center. Single Node.js process on Railway that:
- Discovers war config from chain events (JSON-RPC)
- Queries location events to find assemblies (GraphQL or JSON-RPC)
- Resolves assembly ownership via 3-batch GraphQL pipeline
- Scores each tick and commits to PostgreSQL
- Writes `latest.json` atomically (tmp+rename) for the scoreboard
- Auto-resolves on chain when `ended_at_ms` is reached (JSON-RPC)
- Serves admin panel at `/admin/`, scoreboard at `/`, HTTP API at `/status` and `/notify`
- `POST /notify` wakes the verifier to re-discover war config immediately (admin panel calls this after creating a war or publishing config)
- **Folder structure:** Admin at `admin/src/`, Scoreboard at `scoreboard/src/`, Verifier at `verifier/src/`, API at `api/`, Contracts at `contracts/sources/`

---

## 3. Principles

1. **Cumulative Scoring** — Scores never recalculate. Phase 2 adds to Phase 1's totals. Ledger is append-only.
2. **Event-Driven Discovery** — Verifier discovers everything from chain events. Zero manual config besides env vars.
3. **Ledger Durability** — PostgreSQL is authoritative history. Upsert semantics keep one durable row per tick key, including recomputed current ticks and degraded carry-forward ticks.
4. **Atomic Outputs** — `latest.json` written via tmp+rename [artifact-output.ts::atomicWriteFile()]. Scoreboard never reads a partial file.
5. **Phase Additivity** — New phases add systems or change tick rates. Removed systems stop scoring but keep history.
6. **Source Priority** — Deployed contract > this document > local Move source.

---

## 4. On-Chain Objects [Concept]

| Object | Type | Created By | Purpose |
|--------|------|-----------|---------|
| `WarRegistry` | shared | `admin::create_lineage_war` | War metadata: tribes, resolved flag, ended_at_ms, win_margin. `source_of_truth_mode` is stored but currently all wars use mode 2 (verifier required). |
| `WarAdminCap` | owned | `admin::create_lineage_war` | Admin authorization (transferred to admin wallet) |
| `TribeKey` | dynamic field | `admin::register_tribe` | Per-tribe registration on registry |
| `WarConfigVersion` | shared | `config::publish_war_config` | Tick rate defaults, scoring defaults |
| `PhaseConfig` | shared | `config::publish_phase_config` | Phase boundaries, tick rate override, active systems |
| `SystemConfigVersion` | shared | `config::publish_system_config_version` | Per-system: points, margins, assembly rules |
| `WarResolution` | shared | `registry::resolve_war` | Final: tribe scores, victor, outcome (victory/draw) |
| `WinMarginRecord` | shared | `admin::set_win_margin` | Historical win margin changes |

---

## 5. On-Chain Entry Points

### War Lifecycle

- `admin::create_lineage_war(war_id, display_name, max_tribes, win_margin, source_mode)` → WarRegistry + WarAdminCap
- `admin::register_tribe(registry, admin_cap, tribe_id, display_name)` → TribeKey on registry. Emits `TribeRegisteredEvent`.
- `admin::end_war(registry, admin_cap, ended_at_ms, clock)` → Sets future end time
- `admin::update_war_end_time(registry, admin_cap, ended_at_ms, clock)` → Changes end time
- `admin::cancel_war_end(registry, admin_cap)` → Clears end time, war continues
- `admin::set_win_margin(registry, admin_cap, win_margin)` → Updates margin, creates WinMarginRecord
- `registry::resolve_war(registry, admin_cap, tribe_ids, scores, clock)` → Creates WarResolution, sets resolved=true

### Configuration

- `config::publish_phase_config(registry, admin_cap, ...)` → PhaseConfig. Called directly (Move `public fun`, no entry wrapper needed).
- `config::publish_system_config_version(registry, admin_cap, ...)` → SystemConfigVersion per system
- `config::publish_war_config(registry, admin_cap, ...)` → WarConfigVersion (tick rate, default margins)

**Move `public fun` can be called directly in programmable transactions.** The admin panel composes these into batch transactions — no `admin.move` wrapper required.

### Events the Verifier Listens To

| Event | Emitted By | Discovered In |
|-------|-----------|---------------|
| `WarCreatedEvent` | create_lineage_war | discover-war-config.ts |
| `TribeRegisteredEvent` | register_tribe | discover-war-config.ts |
| `WarConfigPublishedEvent` | publish_war_config | discover-war-config.ts |
| `PhaseConfigPublishedEvent` | publish_phase_config | discover-war-config.ts |
| `SystemConfigPublishedEvent` | publish_system_config_version | discover-war-config.ts |

---

## 6. Verifier Architecture

### Module Map

```
verifier/src/
├── main.ts                    — Entry: env setup, launches live-chain-loop
├── live-chain-loop.ts         — Core: tick scheduling, war lifecycle, resolution
├── discover-war-config.ts     — Discover war config from chain events (JSON-RPC)
├── resolver.ts                — Per-tick scoring: presence → control state → points
├── tick-planner.ts            — Plan which (system, tick) pairs to resolve
├── tick-ledger.ts             — PostgreSQL: committed_ticks_v2 table
├── registry-source.ts         — VerifierDataSource impl (orchestrates all sources)
├── graphql-assembly-source.ts — 3-batch GraphQL: assembly → owner_cap → wallet → tribe
├── fetch-location-events.ts   — LocationRevealedEvent queries
├── location-event-query.ts    — Location event cursor management
├── artifact-output.ts         — Atomic latest.json + audit artifacts
├── frontend-output.ts         — Scoreboard payload builder
├── on-chain-resolve.ts        — Submit resolve_war transaction (JSON-RPC)
├── tribe-resolver.ts          — Tribe name resolution
├── hash.ts                    — Canonical snapshot hashing
├── config.ts                  — Config file parsing
├── types.ts                   — All TypeScript interfaces
├── system-display-config.ts   — System display name overrides
├── assembly-discovery.ts      — Alternative assembly discovery
├── chain-source.ts            — On-chain config reader
├── tick-planner.ts            — Tick schedule computation
└── (test/utility files)       — seeded-source, mock-source, live-simulator, etc.
```

### Transport Layer

The verifier uses TWO protocols:
- **JSON-RPC** (`SuiJsonRpcClient`): War discovery, event queries, registry reads, transaction submission
- **GraphQL**: Assembly ownership resolution (3-batch pipeline), location events (when `LINEAGE_LOCATION_QUERY_MODE=graphql`)

### War Discovery [discover-war-config.ts::discoverWarConfig()]

1. Query `WarCreatedEvent` — find target war (highest ID among unresolved, or specific `LINEAGE_WAR_ID`)
2. Read `WarRegistry` object — enabled, resolved, ended_at_ms, win_margin
3. Query `TribeRegisteredEvent` — build `participatingTribeIds` list
4. Query `WarConfigPublishedEvent` → extract WarConfigVersion IDs → read tick rate
5. Query `PhaseConfigPublishedEvent` → extract PhaseConfig IDs
6. Query `SystemConfigPublishedEvent` → extract SystemConfigVersion IDs + war system IDs

Returns `DiscoveredWarConfig` with everything the verifier needs. **Zero manual configuration.**

### Tick Cycle [live-chain-loop.ts → resolver.ts]

Every tick boundary (15/30/60 minutes):

1. `refreshWarState()` — re-read registry for config changes, end time, resolved status
2. If `now >= ended_at_ms` → run final tick + auto-resolve (see §7)
3. Location refresh — query `LocationRevealedEvent` to find assemblies in war systems
4. `buildTickPlan()` [tick-planner.ts] — determine which (system, tick) pairs need resolving
5. Load committed ticks from PostgreSQL — skip already-committed (idempotent)
6. For each new tick: `resolveTick()` [resolver.ts] →
   a. `getEffectiveSystemConfig()` — merge war + phase + system config (system wins, fallback to war default via `||`)
   b. `getCandidateAssemblies()` — 3-batch GraphQL ownership pipeline
   c. `evaluateAssembly()` — filter by family, type, storage rules
   d. `buildPresenceRows()` — group qualifying assemblies by tribe, sum weighted presence
   e. `resolveSystem()` — determine NEUTRAL / CONTESTED / CONTROLLED + award points
7. `commitTicks()` [tick-ledger.ts] — upsert to PostgreSQL so current-tick recomputations and degraded carry-forward ticks persist durably
8. `buildScoreboardPayload()` [frontend-output.ts] — cumulative scores, chart data
9. `writeVerifierArtifacts()` [artifact-output.ts] — atomic write latest.json + audit artifacts

### Scoring Logic [resolver.ts] [Implementation Anchor]

**Config Precedence:** `systemConfig > phaseConfig > warConfig`. Uses `||` (falsy fallback): a system value of 0 or null falls back to war default. [resolver.ts::getEffectiveSystemConfig()]

**System States:**
- **NEUTRAL**: No tribe meets `neutralMinTotalPresence`, or no assemblies. No points.
- **CONTESTED**: Top tribe's lead < required margin. No points.
- **CONTROLLED**: Top tribe's lead ≥ required margin → gets `pointsPerTick`.

**Margin Logic:**
- If top tribe IS current controller: needs `holdMargin` (easier to keep)
- If top tribe is NOT current controller: needs `takeMargin` (harder to take)
- [resolver.ts::resolveSystem(), lines 220-289]

**Assembly Evaluation (two paths):**
1. **Explicit rules** (`cfg.assemblyRules.length > 0`): Match each assembly against AssemblyRule objects (family + type + storage). Each rule has `presenceWeight`.
2. **Legacy filtering** (no explicit rules): Check family → type → storage type → storage requirements. Weight = 1.

**Storage Requirement Modes:**

| Mode | Semantics |
|------|-----------|
| `NONE` | Always passes |
| `NON_EMPTY` | Any inventory item with quantity > 0 |
| `SPECIFIC_ITEMS` | Must hold at least one of `requiredItemTypeIds` |
| `MINIMUM_TOTAL_QUANTITY` | Total inventory ≥ `minimumTotalItemCount` |

### Ownership Pipeline [graphql-assembly-source.ts] [Implementation Anchor]

3 batched GraphQL queries per tick (batch size 20):
1. **Assembly objects** → JSON state + `owner_cap_id`
2. **OwnerCap objects** → wallet address (AddressOwner)
3. **Character objects** at wallet → `tribe_id`

The verifier retries GraphQL ownership resolution up to five times with bounded backoff. If GraphQL is still unavailable, it freezes the entire tick and persists a degraded result: each system carries forward the last resolved snapshot state, and if no prior resolved state exists the verifier emits an explicit degraded placeholder with no points. Published artifacts mark these ticks with `tickStatus = "degraded_frozen"` plus `degradedReason` and `carriedForwardFromTickMs` when applicable. Degraded historical ticks are not automatically rewritten later.

**Tribe filtering:** After ownership resolution, `TribeResolver` checks each assembly's tribe against `participatingTribeIds` (discovered from `TribeRegisteredEvent`). Non-registered tribes return `null` → assembly excluded from presence rows → cannot influence scoring. [tribe-resolver.ts:74]

### Tick Ledger [tick-ledger.ts]

```sql
CREATE TABLE IF NOT EXISTS committed_ticks_v2 (
  war_id INTEGER NOT NULL,
  system_id INTEGER NOT NULL,
  tick_timestamp_ms BIGINT NOT NULL,
  resolved JSONB NOT NULL,
  committed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (war_id, system_id, tick_timestamp_ms)
);
```

`INSERT ... ON CONFLICT DO UPDATE` keeps one durable row per `(war_id, system_id, tick_timestamp_ms)`. Restart re-resolution can correct the current tick in place, and degraded carry-forward ticks are persisted just like live-resolved ticks.

---

## 7. War Resolution [live-chain-loop.ts, lines 415-560]

When `now >= ended_at_ms`:

1. Run final tick covering all ticks up to end time (no ticks scored after)
2. Sum scores per registered tribe from all resolved ticks
3. Filter to `participatingTribeIds` only (non-registered tribes excluded)
4. Determine outcome: if top tribe margin ≥ `win_margin` → VICTORY (winner_tribe_id set), else DRAW (winner_tribe_id = None)
5. Write `pending_resolution` block to `latest.json` — scoreboard immediately shows "war ended, awaiting on-chain confirmation" with final scores visible
6. `submitResolveWarWithRetry()` [on-chain-resolve.ts] — retries ONLY the on-chain `resolve_war` transaction submission (not scoring or GraphQL). 3 attempts with exponential backoff (2s, 4s, 8s) via JSON-RPC.
7. **On success:** write `resolution.json` atomically (tmp+rename), patch `latest.json` with full resolution block, remove `pending_resolution`
8. **On failure (all retries exhausted):** write `pending_resolution.status = "retrying"` to latest.json. War continues — next tick cycle re-enters resolution. The verifier keeps trying every cycle until it succeeds. No war is ever cancelled due to a network hiccup.

All file writes in the resolution path use atomic tmp+rename pattern.

---

## 8. Admin Panel [admin/src/]

React app served at `/admin/` by the verifier. Wallet-connected (Sui wallet adapter).

### Screens

| Screen | File | Purpose |
|--------|------|---------|
| War Setup | `screens/WarSetupScreen.tsx` | Create war (ID, name, margin, max tribes) |
| Overview | `screens/WarOverview.tsx` | View war state, register tribes |
| Phases | `screens/PhaseManager.tsx` | Configure + publish phases |
| System Config | `screens/SystemConfigEditor.tsx` | Per-system scoring rules |
| Debug | `screens/DebugScreen.tsx` | End war, update end time, cancel end, set win margin |
| Preview | `screens/PreviewScreen.tsx` | Preview transactions before signing |
| Snapshot | `screens/SnapshotScreen.tsx` | View chain state snapshots |
| Schedule | `screens/ScheduleScreen.tsx` | War scheduling |

### Transaction API [lib/transactions.ts]

Unified dispatcher: `buildTransactionForDraft(draft)` builds a `Transaction` from a draft object. `validateDraft(draft)` validates before building.

13 transaction kinds (kebab-case): `create-war`, `register-tribe`, `publish-defaults` (war config), `upsert-system-config`, `batch-phase-config`, `schedule-system-change`, `end-war`, `update-war-end-time`, `cancel-war-end`, `set-win-margin`, `toggle-war` (enable/disable), `resolve-war`, `commit-snapshot`.

After war creation, the admin panel calls `POST /notify` on the verifier to trigger immediate re-discovery.

---

## 9. Scoreboard [scoreboard/src/]

React app served at `/` by the verifier. Reads `latest.json` via polling.

**Data source:** Verifier writes `latest.json` containing: `scoreboard` (tribe scores, chart data, system states), `snapshots`, `commitments`, `tickPlan`, `systemDisplayConfigs`, `audit`.

**State conversion:** Verifier uses strings (`"NEUTRAL"`, `"CONTESTED"`, `"CONTROLLED"`). Frontend converts to numbers (0, 1, 2) via `stateToNumber()` [frontend-output.ts].

**Key war components:** `WarScoreboard`, `WarPhasePanel`, `SystemControlPanel`, `ControlFeed`, `WarEventLog`, `WarTimeline`, `WarSystemMap`.

⚠️ **2-TRIBE DESIGN:** The scoreboard frontend is currently designed and tested for 2-tribe wars only. The on-chain contracts and verifier support N tribes — the frontend needs work to handle 3+ tribes well (color assignment, layout, chart scaling). Contributions welcome.

---

## 10. Pre-Hype System [prehype/]

The pre-war marketing/activation experience lives in `prehype/` within this repo. It handles tribe registration and countdown before scoring begins.

- `api/` — Activation API (Node.js/Hono + PostgreSQL). Manages 3-phase pipeline: `pre_tribes` → `one_tribe_ready` → `both_tribes_ready`. Auth via `ADMIN_SECRET` env var + `X-Admin-Key` header. Self-contained, no dependency on the verifier.
- `WaitingPage.tsx` — Pre-hype countdown UI with soul record intake
- `components/waiting/` — CaptainDossierPanel, HeroViewport, SoulRecordIntake

---

## 11. Deployment

Single Railway service: the verifier process. Serves admin panel + scoreboard as static files.

**Folder Structure:** The `lineage-war/` directory is self-contained and can be extracted as a standalone repository. Contains all sources for on-chain contracts (`contracts/`), verifier (`verifier/`), admin panel (`admin/`), scoreboard (`scoreboard/`), and API layer (`api/`).

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `LINEAGE_PACKAGE_ID` | ✓ | Deployed contract package ID |
| `LINEAGE_SUI_RPC` | | Sui JSON-RPC endpoint (default: testnet fullnode) |
| `LINEAGE_SUI_GRAPHQL_URL` | | Sui GraphQL endpoint (for ownership resolution) |
| `LINEAGE_WORLD_PACKAGE_ID` | ✓ | For LocationRevealedEvent type |
| `DATABASE_PUBLIC_URL` | ✓ | PostgreSQL connection string |
| `LINEAGE_ADMIN_PRIVATE_KEY` | ✓ | Ed25519 key for auto-resolution |
| `LINEAGE_WAR_ID` | | Force specific war (default: auto-discover highest unresolved) |
| `LINEAGE_OUTPUT_PATH` | | Output path (default: `../frontend/score/public/verifier/latest.json`) |
| `LINEAGE_MAX_HISTORY_TICKS` | | Max historical ticks to catch up (default: 48) |
| `LINEAGE_LOCATION_QUERY_MODE` | | `auto`, `graphql`, `rpc`, or `off` (default: auto) |
| `LINEAGE_VERIFIER_PORT` / `PORT` | | HTTP port (default: 3001) |

---

## 12. Failure Modes

| Scenario | What Happens | Recovery |
|----------|-------------|---------|
| Verifier crashes mid-tick | Uncommitted ticks lost. On restart, the verifier re-resolves from ledger + live state. Ledger upserts keep current-tick corrections durable instead of dropping them. | Automatic on restart |
| GraphQL down | Ownership resolution retries up to five times with backoff. If GraphQL still fails, the whole tick is frozen and persisted as degraded by carrying forward the last resolved state per system; if no prior state exists, the verifier emits an explicit degraded placeholder with no points. | Future ticks retry live resolution automatically, but degraded historical ticks stay as recorded unless rewritten manually |
| JSON-RPC down | War discovery fails, `refreshWarState` fails. Resolution retries 3× with backoff; if all fail, war continues and retries next cycle. War never stops due to resolution failure. | Automatic retry every cycle until success |
| PostgreSQL down | `commitTicks()` throws. Tick results lost. Verifier crashes. | Restart after DB recovery; ticks re-resolved |
| Admin publishes bad config | Verifier picks up new config on next cycle. Historical scores preserved. | Publish corrected config |
| Two verifier instances | Both resolve the same ticks. The ledger keeps one row per tick key via upsert, and `latest.json` remains last-write-wins. | Run single instance only |

### Quick Diagnostics

**"War not scoring"** → Check: `GET /status` → is `state` = `running`? If `discovering`, verifier hasn't found configs. Check `SystemConfigPublishedEvent` exists for this war. If `waiting`, no unresolved war found.

**"Scores look wrong"** → Check audit artifacts: `verifier/audit/live/ticks/{tickTimestampMs}.json`. Each tick artifact has full `presenceRows` (per-tribe assembly counts), `resolution` (state + margins), and `candidateAssemblies`. Compare assembly counts against what you expect.

**"Resolution didn't happen"** → Check verifier logs for `"Failed to submit resolve_war transaction"`. Common cause: `LINEAGE_ADMIN_PRIVATE_KEY` doesn't match the wallet that owns `WarAdminCap`. Verify with `discoverAdminCapId()` in `on-chain-resolve.ts`.

**"Config change not picked up"** → Verifier checks for new configs every tick cycle via `refreshWarState()`. If you just published, `POST /notify` triggers immediate re-check.

---

**Trust this document's architecture. Trust the deployed contract for implementation. When they diverge, deployed code wins.**
