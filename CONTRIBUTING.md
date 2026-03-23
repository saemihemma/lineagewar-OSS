# Contributing to Lineage War

We welcome contributions. Here's how to get started.

## Setup

```bash
cd verifier && npm install && cp .env.example .env   # edit with your Sui RPC + keys
cd ../admin && npm install
cd ../scoreboard && npm install
```

You'll need a Sui testnet wallet and a deployed `lineage_war` package. See the architecture doc for env vars.

## Where to Contribute

**Multi-tribe scoreboard** — The frontend is designed for 2 tribes. Contracts and verifier handle N. The scoreboard needs color assignment, layout scaling, and chart readability for 3+ tribes.

**Move contract tests** — Test modules for the core flows (create war, register tribes, resolve) would strengthen confidence.

## Code Style

- TypeScript: follow existing patterns (no semicolons in some files, consistent naming)
- Move: module-level and function-level doc comments on all public functions
- Commits: conventional commits preferred (`fix:`, `feat:`, `docs:`)

## Pull Requests

1. Fork and branch from `main`
2. Keep PRs focused — one concern per PR
3. Include a brief description of what changed and why
4. If touching the verifier, confirm it compiles: `cd verifier && npx tsc --noEmit`

## Architecture

Read [LINEAGE_WAR_ARCHITECTURE.md](./LINEAGE_WAR_ARCHITECTURE.md) before diving into code. It covers the full system in ~350 lines.
