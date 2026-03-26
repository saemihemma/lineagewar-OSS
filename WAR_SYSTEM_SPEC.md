# The Lineage War Product Specification

## Overview

The Lineage War is a competitive territorial-control system on Sui for EVE Frontier. Tribes compete for control of solar systems by deploying smart assemblies. An off-chain verifier scores the war continuously, and the final outcome is permanently recorded on chain.

This document describes product semantics and operator behavior. It is the game-rules companion to the architecture doc, not the source for runtime wiring. For live implementation details, read [LINEAGE_WAR_ARCHITECTURE.md](./LINEAGE_WAR_ARCHITECTURE.md).

## Core Concepts

**War**
A single competition between registered tribes, identified by a unique war ID and a `WarRegistry` object on chain.

**Tribes**
EVE Frontier player groups identified by tribe ID. Only registered tribes can score.

**Systems**
Solar systems where scoring takes place.

**Assemblies**
On-chain smart objects whose ownership and qualification determine system control.

**Phases**
Time-bounded configuration periods within a war. New phases add to the war; they do not recalculate prior scores.

**Ticks**
Scoring intervals, typically 15, 30, or 60 minutes.

## War Lifecycle

### 1. Create war

The operator creates a war from the admin UI:

- war ID
- display name
- max tribes
- win margin
- source of truth mode (`Verifier required` in current live usage)

On chain this creates a `WarRegistry` and a `WarAdminCap`.

### 2. Register tribes

The operator registers each participating tribe from the admin UI. Only registered tribes can influence scoring or appear in final resolution.

### 3. Publish phases and system rules

From the phase-management flow, the operator publishes:

- war defaults
- phase timing and active systems
- per-system scoring rules
- optional public-facing display copy for system names and rule text

The display copy is published to the verifier's operator display-copy surface and later resolved into the public scoreboard payload as `systemDisplayConfigs`.

### 4. Discover and score

The verifier continuously reconstructs effective state from chain events:

- `WarCreatedEvent`
- `TribeRegisteredEvent`
- `WarConfigPublishedEvent`
- `PhaseConfigPublishedEvent`
- `SystemConfigPublishedEvent`

Per tick, the verifier:

1. refreshes war state
2. discovers assemblies in active systems
3. resolves ownership through the assembly -> owner cap -> wallet -> character -> tribe chain
4. evaluates each assembly against effective rules
5. determines whether each system is neutral, contested, or controlled
6. commits the result to PostgreSQL
7. rewrites the public scoreboard artifact

Scores are cumulative and durable. New phases affect future ticks only.

### 5. Handle degraded resolution

If GraphQL ownership resolution fails past retry limits, the verifier does not invent fresh state. It freezes the tick by carrying forward the last resolved system snapshot when possible, or emits an explicit degraded placeholder when no prior resolved state exists. Those degraded ticks remain in history unless rewritten intentionally later.

### 6. Schedule war end

The operator can schedule, move, or cancel `ended_at_ms` from the admin UI. The operator does not need to be online at the exact end moment.

### 7. Auto-resolution

When `now >= ended_at_ms`, the verifier:

1. resolves the final eligible ticks
2. totals scores for registered tribes
3. compares the leading margin against `win_margin`
4. writes `pending_resolution` into the live public artifact
5. retries the on-chain `resolve_war` transaction until it succeeds
6. writes `resolution.json` and clears `pending_resolution` after success

If the leading tribe does not clear `win_margin`, the final outcome is a draw.

## Operator And Player Semantics

- Operators use the admin flow to publish lifecycle changes, phase configuration, and optional public display copy for systems.
- Players consume the verifier-generated scoreboard and audit views as a read model of the current war.
- Exact routes, artifact files, and runtime service boundaries live in [LINEAGE_WAR_ARCHITECTURE.md](./LINEAGE_WAR_ARCHITECTURE.md), not in this document.

## Source Of Truth Model

- **Sui chain:** war lifecycle, config publication, final resolution
- **PostgreSQL:** durable tick ledger
- **Editorial display store:** published human-facing rule text and names
- **Public artifacts:** current read model for the scoreboard
