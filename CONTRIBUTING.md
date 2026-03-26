# Contributing To Lineage War

Lineage War is easiest to contribute to when changes stay close to one subsystem and make their runtime impact explicit. This repository mixes Move contracts, a live verifier, two React frontends, and a separate activation API. Good contributions are narrow, well-verified, and honest about what part of the system they affect.

## Where Help Is Most Valuable

- **Multi-tribe scoreboard work:** contracts and verifier support N tribes, but the public UI is still mostly a 2-tribe experience.
- **Verifier reliability and scaling:** the live runtime is practical, but it still centralizes discovery, scoring, artifact generation, static hosting, and final resolution in one service.
- **Move contract tests and review:** the lifecycle is live, but deeper automated coverage and expert review would raise confidence quickly.
- **Editorial display hardening:** `/editorial-display` works, but stronger auth and durability guarantees are still worth adding.
- **Docs, diagnostics, and operator tooling:** clear runbooks, inspection tools, and contributor guidance are all genuinely useful here.

The active pre-war activation service lives in top-level `api/`. `prehype/api/` currently mirrors that code and should be treated as legacy until the repo is consolidated.

## Recommended Inspection Paths

### Move And On-Chain Review

Start here if you care about object model, access control, and resolution semantics:

1. `contracts/sources/admin.move`
2. `contracts/sources/config.move`
3. `contracts/sources/registry.move`
4. `contracts/sources/rules.move`
5. `LINEAGE_WAR_ARCHITECTURE.md`

### Verifier And Runtime Review

Start here if you care about correctness, reliability, or live operations:

1. `verifier/src/live-chain-loop.ts`
2. `verifier/src/discover-war-config.ts`
3. `verifier/src/resolver.ts`
4. `verifier/src/artifact-output.ts`
5. `verifier/LIVE_OPS_RUNBOOK.md`

### Admin And Scoreboard Review

Start here if you care about operator workflows or public presentation:

1. `admin/src/screens/WarOverview.tsx`
2. `admin/src/screens/PhaseManager.tsx`
3. `admin/src/lib/verifier-sync.ts`
4. `scoreboard/src/pages/WarPage.tsx`
5. `scoreboard/src/components/war/`

### Activation Flow Review

Start here if you care about the pre-war intake system:

1. `api/src/index.ts`
2. `api/src/routes/activation.ts`
3. `prehype/WaitingPage.tsx`
4. `prehype/components/`

## Current Constraints Worth Knowing

The canonical list of live limitations and operational tradeoffs lives in [LINEAGE_WAR_ARCHITECTURE.md](./LINEAGE_WAR_ARCHITECTURE.md#8-known-limitations). Check that section before changing system boundaries, artifacts, or repo-level claims.

The activation API still exists in both `api/` and `prehype/api/`, but top-level `api/` is the active path contributors should use.

## Local Setup

```bash
# verifier
cd verifier
npm install
cp .env.example .env

# admin
cd ../admin
npm install

# scoreboard
cd ../scoreboard
npm install

# activation API
cd ../api
npm install
```

You will need a Sui testnet wallet and a deployed `lineage_war` package for meaningful live-path work.

## Validation Expectations

Run the checks for the surfaces you touched:

| Area | Minimum check |
| --- | --- |
| `verifier/` | `npm run check` and `npm run build` |
| `admin/` | `npm run build` |
| `scoreboard/` | `npm run build` |
| `api/` | `npm run build` |
| `contracts/` | `sui move build` |

If your change affects verifier HTTP routes, artifact shape, or public rule text flow, also update the top-level docs so they stay truthful.

## Pull Request Guidelines

1. Branch from `main`.
2. Keep the PR focused on one concern.
3. Explain the runtime impact, not just the code diff.
4. Call out any chain, verifier, or artifact compatibility implications.
5. Include the checks you ran.
6. If the change leaves an intentional limitation in place, say so directly.

## Sensitive Issues

Use public git issues and PRs by default.

If you believe you found a live exploit involving wallet authorization, admin-only mutation paths, or fund-loss risk, contact the maintainer directly before posting full public details.

## Contribution Standards

- Prefer small, inspectable changes over broad rewrites.
- Do not quietly change artifact shapes or verifier routes without updating the docs.
- Preserve the distinction between on-chain authority and verifier-derived read models.
- If you add operational complexity, add a runbook note with it.

## Before You Start

Read [README.md](./README.md) for the repo overview and [LINEAGE_WAR_ARCHITECTURE.md](./LINEAGE_WAR_ARCHITECTURE.md) for the live system model. If you are touching scoring, war resolution, or any public artifacts, start there before editing code.
