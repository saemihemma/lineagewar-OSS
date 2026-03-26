# Lineage War Architecture

Audience: engineers, operators, and Move experts reviewing the live Lineage War stack.

Priority of truth: deployed contract and current code on `main` win over this document. This document is meant to stay smaller than the codebase and only cover the runtime surfaces that matter for understanding, operating, and extending the live system.

## 1. What the system is

Lineage War is a territorial-control event system on Sui for EVE Frontier. Operators create a war, register tribes, publish phases and per-system rules, and schedule an end time. The verifier discovers that war from chain events, scores systems tick by tick off chain, publishes auditable public artifacts, and submits the final `resolve_war` transaction when the war ends.

This repository includes the full operational stack:

- Move contracts in `contracts/`
- the live verifier in `verifier/`
- the operator admin UI in `admin/`
- the public scoreboard in `scoreboard/`
- the activation API in `api/`
- the pre-war waiting-page UI in `prehype/`

## 2. Live topology

The live system has four important relationships:

1. The admin UI signs wallet transactions directly against the deployed `lineage_war` package on Sui.
2. The admin UI also uses verifier HTTP endpoints to trigger rediscovery and publish editorial display copy.
3. The verifier reads chain state, ownership data, and prior committed ticks, then writes the public artifact set consumed by the scoreboard.
4. The activation API and prehype UI are adjacent repo surfaces, but they are not part of the live war-scoring loop.

See [architecture.mermaid](./architecture.mermaid) for the top-level diagram.

## 3. Core runtime flows

### Admin publish flow

1. The operator creates or updates war state from the admin panel.
2. Those actions are wallet-signed transactions against Sui.
3. After publish, the admin UI calls `POST /notify` so the verifier re-discovers chain state immediately. `POST /notify` is a trigger boundary, not a publish API and not an authoritative write surface by itself.
4. If the draft includes public display copy, the admin UI also calls `POST /editorial-display`.
5. The same editorial surface can be read back with `GET /editorial-display?warId=<id>`.

### Verifier scoring flow

1. `verifier/src/live-chain-loop.ts` discovers the preferred unresolved war from events unless `LINEAGE_WAR_ID` forces a specific war.
2. On each tick boundary, the verifier refreshes registry state, resolves active systems, and upserts the durable tick ledger in PostgreSQL.
3. It builds the public envelope, resolves current system display copy from runtime editorial entries plus legacy fallback config, and atomically writes the public artifact set.
4. The scoreboard polls `/verifier/latest.json` and renders the live state from that envelope.

### War-end flow

1. When `now >= ended_at_ms`, the verifier resolves the final tick window and computes the score margin.
2. If the top tribe clears `win_margin`, the outcome is a victory. Otherwise the outcome is a draw.
3. The verifier writes a `pending_resolution` block into `latest.json`, retries the on-chain `resolve_war` transaction, and writes `resolution.json` on success.
4. A sibling `public-war-state.json` marker lets the verifier keep the last resolved war visible when there is no unresolved war to score.
5. The activation APIs are adjacent operational services for the pre-war flow; they are not part of the verifier's scoring or artifact contract.

## 4. Verifier HTTP and artifact surfaces

### Runtime HTTP endpoints

These live in `verifier/src/live-chain-loop.ts`.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/status` | `GET` | Current runtime status, current war, tick cadence, notify hint, and diagnostics |
| `/notify` | `POST` | Trusted operator trigger for immediate re-discovery after admin changes |
| `/editorial-display?warId=<id>` | `GET` | Trusted operator readback for stored editorial display entries |
| `/editorial-display` | `POST` | Trusted operator write surface for public display names and public rule text |
| `/verifier/*` | `GET` | Serve public artifact files such as `latest.json` and audit files |
| `/admin/*` | `GET` | Serve the built admin bundle when `admin/dist` exists |
| `/` | `GET` | Serve the built scoreboard bundle when `scoreboard/dist` exists |

### Public artifacts

By default the verifier writes the main envelope to `runtime/verifier/latest.json`. Related files are written next to it.

| Artifact | Default location | Notes |
| --- | --- | --- |
| Live envelope | `runtime/verifier/latest.json` | Public scoreboard payload plus config, commitments, snapshots, tick plan, system display configs, and audit summary |
| Resolution artifact | `runtime/verifier/resolution.json` | Final resolved winner or draw outcome after on-chain resolution succeeds |
| Sticky public-war marker | `runtime/verifier/public-war-state.json` | Tracks the last resolved public war so the public site does not snap back to an empty state |
| Audit index | `runtime/verifier/audit/latest/index.json` | Tick inventory for the current envelope stem |
| Tick artifacts | `runtime/verifier/audit/latest/ticks/<tick>.json` | Per-tick audit artifacts with snapshots, commitments, presence rows, assemblies, and editorial display resolution |
| Tick receipts | `runtime/verifier/audit/latest/receipts/<tick>.json` | Receipt path targets referenced by audit artifacts |

### Internal verifier runtime stores

These are implementation details behind the verifier API and artifact writer, not public read-model contracts.

| Store | Default location | Notes |
| --- | --- | --- |
| Editorial display persistence | `runtime/verifier/editorial-display.json` | Internal runtime store behind `GET/POST /editorial-display` for system names and rule text |

### What the scoreboard consumes

The scoreboard defaults to `/verifier/latest.json` unless build-time env overrides are used. The envelope includes:

- `config`
- `tickPlan`
- `commitments`
- `snapshots`
- `scoreboard`
- `systemDisplayConfigs`
- `audit`

The public UI uses `systemDisplayConfigs[].publicRuleText` to render the rule column for active systems. It does not read `editorial-display.json` directly.

## 5. On-chain surface

### Core objects

| Object | Purpose |
| --- | --- |
| `WarRegistry` | Shared war metadata including tribes, end time, resolved flag, and win margin |
| `WarAdminCap` | Owned admin authority for mutation and final resolution |
| `WarConfigVersion` | Shared defaults for scoring and tick cadence |
| `PhaseConfig` | Shared phase boundaries, active systems, and optional tick override |
| `SystemConfigVersion` | Shared per-system scoring and assembly-rule config |
| `WarResolution` | Final on-chain outcome and score record |

### Concrete Move functions used by the live stack

The admin UI assembles transactions against both convenience functions in `admin.move` and lower-level functions in `registry.move` and `config.move`. The table below names concrete public Move functions that exist in `contracts/sources/`.

| Move function | Purpose |
| --- | --- |
| `admin::create_lineage_war` | Create a new war registry and admin cap |
| `admin::register_tribe` | Register a tribe for a war |
| `admin::end_lineage_war` | Schedule the first war end time |
| `registry::update_war_end_time` | Move an already scheduled war end |
| `registry::cancel_war_end` | Clear an already scheduled war end |
| `config::publish_war_config_version` | Publish default scoring and tick config |
| `config::publish_phase_config` | Publish a phase with active systems and timing |
| `config::publish_system_config_version` | Publish per-system scoring and assembly rules |
| `registry::set_win_margin` | Update the required final score margin |
| `registry::resolve_war` | Submit the final result on chain |

The verifier discovers wars and config versions from emitted events rather than from hand-maintained config.

## 6. Code map

### Verifier

The live runtime entrypoint is `verifier/src/live-chain-loop.ts`. It owns:

- war discovery and polling
- runtime HTTP endpoints
- tick scheduling and resolution
- sticky ended-war hydration
- final on-chain resolution

Supporting modules worth reading:

- `verifier/src/discover-war-config.ts` - discover wars, tribes, and config object IDs from chain events
- `verifier/src/resolver.ts` - resolve control state and points for one system tick
- `verifier/src/tick-ledger.ts` - PostgreSQL upsert ledger
- `verifier/src/artifact-output.ts` - atomic public artifacts and audit writing
- `verifier/src/editorial-display-store.ts` - runtime editorial display persistence and resolution
- `verifier/src/frontend-output.ts` - build the public scoreboard payload
- `verifier/src/on-chain-resolve.ts` - submit the final `resolve_war` transaction

### Admin

Key files:

- `admin/src/lib/transactions.ts` - transaction assembly and validation
- `admin/src/lib/verifier-sync.ts` - `POST /notify`, `GET/POST /editorial-display`, and editorial payload building
- `admin/src/screens/PhaseManager.tsx` - phase publishing and display-copy editing
- `admin/src/screens/PreviewScreen.tsx` - transaction preview and publish flow

### Scoreboard

Key files:

- `scoreboard/src/pages/WarPage.tsx` - live war page
- `scoreboard/src/components/war/SystemControlPanel.tsx` - public system list and rule-text rendering
- `scoreboard/src/lib/constants.ts` - live snapshot URL and build-time external-link config

## 7. Deployment and environment

### Verifier runtime env

These are the runtime env vars most operators need to understand:

| Variable | Required | Notes |
| --- | --- | --- |
| `LINEAGE_PACKAGE_ID` | Yes | Deployed `lineage_war` package ID |
| `LINEAGE_SUI_RPC` | Yes in practice | JSON-RPC endpoint; defaults to the Sui testnet fullnode if unset |
| `LINEAGE_SUI_GRAPHQL_URL` | No | GraphQL endpoint used for ownership resolution |
| `LINEAGE_WORLD_PACKAGE_ID` | Yes for live discovery | Used to derive the location event type |
| `DATABASE_PUBLIC_URL` | Yes | PostgreSQL connection string for the tick ledger |
| `LINEAGE_ADMIN_PRIVATE_KEY` | Required for auto-resolution | Wallet key for the owner of the active `WarAdminCap` |
| `LINEAGE_WAR_ID` | No | Force a specific war instead of auto-discovery |
| `LINEAGE_OUTPUT_PATH` | No | Defaults to `runtime/verifier/latest.json` |
| `LINEAGE_EDITORIAL_DISPLAY_PATH` | No | Defaults to a sibling `editorial-display.json` next to the output path |
| `LINEAGE_MAX_HISTORY_TICKS` | No | Catch-up window for missed ticks; defaults to `48` |
| `LINEAGE_LOCATION_QUERY_MODE` | No | `auto`, `graphql`, `rpc`, or `off` |
| `LINEAGE_VERIFIER_PORT` or `PORT` | No | HTTP port; defaults to `3001` |

### Frontend build-time env

| Workspace | Variable | Purpose |
| --- | --- | --- |
| `scoreboard/` | `VITE_PREDICTION_MARKET_URL` | Prediction-market CTA destination |
| `scoreboard/` | `VITE_AIRDROP_URL` | Airdrop CTA destination |
| `scoreboard/` | `VITE_LIVE_VERIFIER_SNAPSHOT_URL` | Override `/verifier/latest.json` if needed |
| `admin/` | `VITE_VERIFIER_URL` | Override the verifier base URL for notify and editorial-display calls |

## 8. Known limitations

These are current truths, not hidden backlog:

- The public scoreboard is still effectively a 2-tribe UI even though the contracts and verifier support N tribes.
- The verifier is operated as a single active writer for public artifacts. PostgreSQL protects tick keys, but artifact files are still last-write-wins.
- Degraded frozen ticks remain part of historical truth rather than being silently rewritten when upstream GraphQL recovers later.
- If the final score margin does not clear `win_margin`, the war ends in a draw.
- The activation API currently exists in both `api/` and `prehype/api/` with mirrored code.
- `/editorial-display` currently assumes trusted internal callers. Auth and durability hardening remain open work.

If this document and current code diverge, trust current code and update the document rather than smoothing over the mismatch.
