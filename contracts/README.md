# Lineage War — Sui Move Contracts

On-chain contracts for the Lineage War territorial control system. Built with Move 2024 edition on Sui.

## Modules

| Module | Purpose |
|--------|---------|
| `admin` | WarAdminCap, admin transaction functions (create war, register tribes, commit snapshots) |
| `config` | WarRegistry, WarConfigVersion, config lifecycle and versioning |
| `errors` | Error code constants |
| `events` | Event types (SnapshotCommitted, ConfigPublished, etc.) |
| `presence` | Assembly presence validation and qualification rules |
| `registry` | War object registry and lookup |
| `rules` | Scoring rules, control conditions, margin mechanics |
| `schedule` | Scheduled config changes and phase transitions |
| `snapshots` | SnapshotRecord objects and commit functions |
| `systems` | WarSystem, SystemConfigVersion — per-system scoring config |
| `view` | Read-only query functions for frontends and indexers |

## Build

Requires [world-contracts](https://github.com/evefrontier/world-contracts) cloned to `../../repos/world-contracts/`:

```bash
git clone https://github.com/evefrontier/world-contracts ../../repos/world-contracts
sui move build
```

## Tests

No test suite exists yet. Contributions welcome.
