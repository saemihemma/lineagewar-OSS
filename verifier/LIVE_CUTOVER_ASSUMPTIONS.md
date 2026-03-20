# Lineage War Verifier: Live Cutover Assumptions

This document tracks what the verifier currently treats as:

- live-backed now
- builder-scaffold-backed now
- temporary bootstrap data
- expected replacement work for live cutover

The goal is to keep spoof debt explicit and small.

## Current Intent

The verifier should be tribe-first, not assembly-first:

1. inspect candidate assemblies in contested systems
2. derive `ownerCharacterId`
3. resolve `ownerCharacterId -> tribeId`
4. filter to participating tribes
5. score control by tribe in each configured system

For live Frontier, the intended ownership model is:

1. inspect assembly
2. resolve assembly -> character
3. resolve character -> tribe
4. use tribe id for scoring

Display names are optional metadata; tribe id remains the authoritative scoring key.

That means temporary bootstrap data should only fill gaps in:

- assembly discovery
- system assignment
- owner-to-tribe resolution

It should not redefine the scoring model.

## Live-Backed Now

- `WarRegistry`, `WarConfigVersion`, `PhaseConfig`, and `SystemConfigVersion` can be read from Sui RPC in `chain` or `registry` mode.
- `registry` mode reads real assembly objects from Sui by object ID.
- Assembly existence, owner, and any parsable status/type fields are taken from live object reads when available.
- Snapshot commit transaction building is wired against the real `lineage_war::admin::commit_snapshot_record` entrypoint.
- Live Nebula inspection has already shown real assembly fields for `tenant`, `type_id`, `status`, and `location_hash`, plus a path to shared `Character` objects that expose `tribe_id`.

## Builder-Scaffold-Backed Now

- Seed metadata from `test-resources.json` is still used to interpret known assembly families, type IDs, storage type IDs, and seeded identities.
- When available later, builder-scaffold copied deployment outputs such as `deployments/<network>/extracted-object-ids.json` are the preferred source for real object IDs.
- The verifier examples and live bootstrap manifests are intentionally shaped so they can be filled from builder-scaffold outputs instead of inventing a parallel schema.
- The local three-system simulation now uses builder-scaffold-backed seed metadata plus authored assembly populations, so the verifier exercises the same family/type/storage/item filters the live path will use.
- In that local simulation only, published location is temporarily scaffolded as `publishedLocation.solarsystem` on simulated assembly objects until the real location registry query surface exists.
- The verifier now also has a spawned-world import bridge that reads `test-resources.json`, `extracted-object-ids.json`, and a small overlay file to generate registry-style manifests for the proof path on testnet.

## Temporary Bootstrap Data

### 1. Assembly Registry Manifest

File path:

- `verifier/registry/live-assemblies.example.json`
- `verifier/registry/testnet-live-assemblies.json`
- `verifier/registry/generated/*-live-assemblies.json`

Purpose:

- list the assembly object IDs the verifier should inspect
- provide minimum bootstrap data where the live object read is incomplete

Temporary fields:

- `bootstrapSystemId`
- optional `bootstrapLocationHashHex`
- `bootstrapOwnerCharacterId`
- optional `bootstrapStatus`
- optional `bootstrapInventory`

Why temporary:

- system/location should eventually be resolved from live published assembly state
- owner character should ideally come directly from live assembly-to-character resolution
- the current testnet bootstrap uses real testnet object IDs that are not yet live assembly objects, only a chain-backed substrate for registry-mode reads
- published location is an opt-in warfare signal, so the verifier must always assume partial visibility rather than omniscience

### 1b. Location Hash Mapping Bootstrap

File path:

- `verifier/registry/location-hashes.example.json`

Purpose:

- temporarily resolve `location_hash -> systemId` before published assembly objects include live `system_id`

Temporary fields:

- `locationHashHex`
- `systemId`

Why temporary:

- once the on-chain publication flow writes `systemId` directly onto the assembly object, the verifier should use that live field first and the mapping file becomes a compatibility bridge only

Important boundary:

- this `location_hash -> systemId` bridge remains part of the current live registry scaffold only
- it is not the target architecture for the local three-system seeded simulation, which now derives system assignment from explicit published-location-style `solarsystem`

### 2. Owner-To-Tribe Registry Manifest

File path:

- `verifier/registry/owner-tribes.example.json`
- `verifier/registry/testnet-owner-tribes.json`
- `verifier/registry/generated/*-owner-tribes.json`

Purpose:

- declare current participating tribe IDs
- bootstrap `ownerCharacterId -> tribeId`
- optionally provide `tribeId -> displayName`

Temporary fields:

- `participatingTribeIds`
- `owners[]`
- optional `tribes[]`

Why temporary:

- the live target state is to read tribe membership from the real assembly -> character -> tribe path on-chain
- display names may continue to come from optional metadata even after tribe ids are fully live-resolved

### 2b. Testnet Setup Snapshot

File path:

- `verifier/registry/testnet-setup.json`

Purpose:

- record the currently published `lineage_war` package, registry, admin cap, and config object IDs
- keep the verifier smoke-test inputs tied to a concrete on-chain setup

Why temporary:

- this file is a convenience snapshot for the current tracer-bullet deployment and can be regenerated after republish or upgrade

### 3. Active Systems Bootstrap

Current state:

- `PhaseConfig` does not yet fully provide active systems on-chain for the verifier flow

Temporary input:

- `LINEAGE_ACTIVE_SYSTEM_IDS`

Why temporary:

- active systems should eventually come entirely from live phase data

## What Is Not Temporary

- the tribe-first control model
- the use of assembly -> character -> tribe as the intended live ownership chain
- per-system eligibility rules
- the use of participating tribe IDs as the scoring identity
- chain-backed config version selection
- canonical snapshot hashing and commit preparation
- the new hourly audit artifact shape and receipt-based public verification loop

These are intended to remain stable through live cutover.

## Expected Live Replacement Work

### Replace First

1. Replace `live-assemblies` object IDs with builder-scaffold-derived or live deployment object IDs.
2. Replace `bootstrapOwnerCharacterId` where live assembly-to-character resolution exposes the character directly.
3. Replace `owner-tribes` JSON with a real on-chain tribe membership resolver.
4. Replace the current non-assembly testnet substrate objects in `testnet-live-assemblies.json` with real seeded/live assembly object IDs as soon as they exist.
5. Prefer published `systemId` on the assembly object over the temporary `locationHashHex -> systemId` mapping file as soon as the feature lands.

### Replace Later

1. Replace `bootstrapSystemId` with live system/location resolution.
2. Replace `LINEAGE_ACTIVE_SYSTEM_IDS` bootstrap when phase/system activation is fully chain-readable.
3. Remove any remaining bootstrap status or inventory fields once live object fields are sufficient.

## Cutover Checklist

- `LINEAGE_WAR_REGISTRY_ID` points at the live war registry
- `LINEAGE_WAR_CONFIG_IDS` points at live config versions
- `LINEAGE_SYSTEM_CONFIG_IDS` points at live system configs
- `LINEAGE_PARTICIPATING_TRIBE_IDS` matches the real war tribes
- `LINEAGE_ASSEMBLY_REGISTRY_PATH` contains real object IDs from seeded/live deployment outputs
- `LINEAGE_OWNER_TRIBE_REGISTRY_PATH` matches the intended character identities and tribe ids for the participating tribes
- `LINEAGE_LOCATION_MAPPING_PATH` matches any temporary `location_hash -> systemId` bootstrap entries until live publication includes `systemId`
- `demo:registry` resolves expected controllers in contested systems
- verifier output contains live `systemConfigObjectId` values
- verifier output includes `audit.inputs.*` provenance that honestly labels live versus fallback inputs
- per-tick audit artifacts are published under `audit/<feed>/ticks/`
- dry-run or execute receipts are published under `audit/<feed>/receipts/`
- `verify:audit` passes against the published receipt for the current hour
- `prepare:commit` succeeds
- `submit:commit` dry-run succeeds before any live execute

## Server Cutover Note

If Nebula and Stillness keep the same on-chain schemas, the Wednesday cutover should be a data refresh, not a model rewrite.

Expected Wednesday changes:

- tenant or sender context in live world objects
- live assembly ids
- published location hashes or direct system ids
- participating tribe ids
- optional tribe display metadata

Expected non-changes:

- war scoring rules
- assembly -> character -> tribe intent
- snapshot and commit flow

## Guardrail

If new spoof data is introduced, add it here immediately with:

- why it exists
- whether it is builder-scaffold-backed or purely temporary
- what live source should replace it
- what condition lets us delete it

## Audit Provenance Labels

The verifier now emits explicit provenance labels into the public audit artifact instead of hiding
fallback behavior in env vars alone.

Current labels you should expect in v1:

- `registry_live_object`: assembly existence came from a real Sui object read
- `live_system_id`: the live object exposed `system_id` directly
- `location_hash_mapping`: the live object exposed `location_hash`, then the verifier used the temporary mapping manifest
- `fallback_system_id`: system assignment still came from bootstrap data
- `scenario_published_solarsystem`: the seeded simulation resolved system assignment from published-location-style `solarsystem`
- `owner_tribe_registry_manifest`: tribe identity still came from the temporary owner registry JSON
- `seeded_scenario_fallback`: the run still depended on seeded/scenario candidates instead of live assembly discovery

If a new fallback mode appears, add its label and meaning here immediately.
