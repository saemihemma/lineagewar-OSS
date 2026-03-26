# Lineage War Sui Move Contracts

This package contains the on-chain objects and public entry points for the Lineage War territorial-control system. It is written for Sui Move 2024 edition.

## Modules

| Module | Purpose |
|--------|---------|
| `admin` | Convenience admin entry points such as war creation, tribe registration, end scheduling, and snapshot commits |
| `config` | War, phase, and system config version publishing plus rule-set mutation helpers |
| `errors` | Error code constants |
| `events` | Event structs emitted by registry, config, and snapshot flows |
| `presence` | Assembly presence validation and qualification rules |
| `registry` | `WarRegistry`, `WarAdminCap`, tribe registration, end-time changes, win-margin updates, and final resolution |
| `rules` | Scoring rules, control conditions, source-of-truth modes, and margin mechanics |
| `schedule` | Scheduled config changes and phase transitions |
| `snapshots` | Snapshot record objects and commit functions |
| `systems` | `WarSystem` registration and per-system metadata |
| `view` | Read-only helper functions for frontends and indexers |

## Build

Requires [world-contracts](https://github.com/evefrontier/world-contracts) cloned to `../../repos/world-contracts/`:

```bash
git clone https://github.com/evefrontier/world-contracts ../../repos/world-contracts
sui move build
```

## Review Path

Move reviewers usually get the fastest signal from:

1. `sources/admin.move`
2. `sources/config.move`
3. `sources/registry.move`
4. `../WAR_SYSTEM_SPEC.md`
5. `../LINEAGE_WAR_ARCHITECTURE.md`

## Tests

No automated Move test suite exists yet. The minimum verification path today is `sui move build`, followed by direct source inspection of `admin.move`, `config.move`, and `registry.move`.
