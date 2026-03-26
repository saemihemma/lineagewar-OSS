import { Transaction } from "@mysten/sui/transactions";
import { LINEAGE_WAR_PACKAGE_ID } from "./constants";
import type { AdminDraft, DraftPreview, ExecutionRecord } from "./types";

const OBJECT_ID_PATTERN = /^0x[a-fA-F0-9]+$/;
const HEX_BYTES_PATTERN = /^(0x)?[a-fA-F0-9]+$/;

function packageIdOrPlaceholder(): string {
  return LINEAGE_WAR_PACKAGE_ID && LINEAGE_WAR_PACKAGE_ID !== "0x0" ? LINEAGE_WAR_PACKAGE_ID : "<lineage-war-package-id>";
}

function requirePackageId(): string {
  if (!LINEAGE_WAR_PACKAGE_ID || LINEAGE_WAR_PACKAGE_ID === "0x0") {
    throw new Error("Set VITE_LINEAGE_WAR_PACKAGE_ID before building admin transactions.");
  }
  return LINEAGE_WAR_PACKAGE_ID;
}

function hexToBytes(hex: string): number[] {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!normalized || normalized.length % 2 !== 0) {
    throw new Error("Snapshot hash must be a non-empty hex string with an even number of characters.");
  }

  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(Number.parseInt(normalized.slice(index, index + 2), 16));
  }
  return bytes;
}

function previewLinesForRuleSet(draft: Extract<AdminDraft, { kind: "upsert-system-config" }>): string[] {
  return [
    `Allowed assembly families: ${draft.ruleSet.allowedAssemblyFamilies.join(", ") || "none"}`,
    `Allowed assembly type IDs: ${draft.ruleSet.allowedAssemblyTypeIds.join(", ") || "none"}`,
    `Allowed storage type IDs: ${draft.ruleSet.allowedStorageTypeIds.join(", ") || "none"}`,
    `Required item type IDs: ${draft.ruleSet.requiredItemTypeIds.join(", ") || "none"}`,
  ];
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isUnsignedInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function isObjectId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value.trim());
}

function hasEvenHexBytes(value: string): boolean {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return HEX_BYTES_PATTERN.test(value) && normalized.length > 0 && normalized.length % 2 === 0;
}

function appendIfInvalid(target: string[], condition: boolean, message: string): void {
  if (!condition) {
    target.push(message);
  }
}

function isSingleLine(value: string): boolean {
  return !/[\r\n]/.test(value);
}

function appendWarMismatchIfKnown(
  target: string[],
  expectedWarId: number,
  actualWarId: number | null | undefined,
  label: string,
): void {
  if (actualWarId === null || actualWarId === undefined) {
    return;
  }

  appendIfInvalid(target, actualWarId === expectedWarId, `${label} war ID does not match the selected draft war ID.`);
}

function appendSystemMismatchIfKnown(
  target: string[],
  expectedSystemId: number,
  actualSystemId: number | null | undefined,
  label: string,
): void {
  if (actualSystemId === null || actualSystemId === undefined) {
    return;
  }

  appendIfInvalid(
    target,
    actualSystemId === expectedSystemId,
    `${label} system ID does not match the selected draft system ID.`,
  );
}

export function validateDraft(draft: AdminDraft): string[] {
  const issues: string[] = [];
  appendIfInvalid(
    issues,
    Boolean(LINEAGE_WAR_PACKAGE_ID && LINEAGE_WAR_PACKAGE_ID !== "0x0"),
    "VITE_LINEAGE_WAR_PACKAGE_ID must be set to a deployed Lineage War package ID.",
  );

  switch (draft.kind) {
    case "create-war":
      appendIfInvalid(issues, isPositiveInteger(draft.warId), "War ID must be a positive integer.");
      appendIfInvalid(issues, draft.slug.trim().length > 0, "Slug is required.");
      appendIfInvalid(issues, draft.displayName.trim().length > 0, "Display name is required.");
      appendIfInvalid(issues, isPositiveInteger(draft.maxSupportedTribes), "Max supported tribes must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.winMargin), "Win margin must be greater than zero.");
      break;

    case "publish-defaults":
      appendIfInvalid(issues, isPositiveInteger(draft.warId), "War ID must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.version), "Config version must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.defaultTickMinutes), "Default tick minutes must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.defaultPointsPerTick), "Default points per tick must be a positive integer.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "War admin cap ID must look like a Sui object ID.");
      appendWarMismatchIfKnown(issues, draft.warId, draft.adminCapWarId, "Selected admin cap");
      break;

    case "upsert-system-config":
      appendIfInvalid(issues, isPositiveInteger(draft.warId), "War ID must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.systemId), "System ID must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.version), "System config version must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.pointsPerTick), "Points per tick must be a positive integer.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "War admin cap ID must look like a Sui object ID.");
      appendWarMismatchIfKnown(issues, draft.warId, draft.adminCapWarId, "Selected admin cap");
      appendIfInvalid(
        issues,
        !draft.registerSystem || draft.displayName.trim().length > 0,
        "Display name is required when registering a new WarSystem.",
      );
      appendIfInvalid(
        issues,
        draft.tickMinutesOverride === null || isPositiveInteger(draft.tickMinutesOverride),
        "Tick override must be blank or a positive integer.",
      );
      appendIfInvalid(
        issues,
        [...draft.ruleSet.allowedAssemblyTypeIds, ...draft.ruleSet.allowedStorageTypeIds, ...draft.ruleSet.requiredItemTypeIds].every(
          isUnsignedInteger,
        ),
        "Assembly type IDs, storage type IDs, and required item IDs must be unsigned integers.",
      );
      appendIfInvalid(
        issues,
        draft.displayCopy.displayRuleLabel.length <= 24,
        "Display rule label must be 24 characters or fewer.",
      );
      appendIfInvalid(
        issues,
        draft.displayCopy.displayRuleDescription.length <= 160,
        "Display rule description must be 160 characters or fewer.",
      );
      appendIfInvalid(
        issues,
        isSingleLine(draft.displayCopy.displayRuleLabel),
        "Display rule label must be a single line.",
      );
      appendIfInvalid(
        issues,
        isSingleLine(draft.displayCopy.displayRuleDescription),
        "Display rule description must be a single line.",
      );
      break;

    case "schedule-system-change":
      appendIfInvalid(issues, isPositiveInteger(draft.warId), "War ID must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.changeId), "Change ID must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.targetSystemId), "Target system ID must be a positive integer.");
      appendIfInvalid(issues, isObjectId(draft.configObjectId), "Config object ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "War admin cap ID must look like a Sui object ID.");
      appendWarMismatchIfKnown(issues, draft.warId, draft.adminCapWarId, "Selected admin cap");
      appendWarMismatchIfKnown(issues, draft.warId, draft.configWarId, "Selected config object");
      appendSystemMismatchIfKnown(issues, draft.targetSystemId, draft.configSystemId, "Selected config object");
      break;

    case "toggle-war":
      appendIfInvalid(issues, isPositiveInteger(draft.warId), "War ID must be a positive integer.");
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "War admin cap ID must look like a Sui object ID.");
      appendWarMismatchIfKnown(issues, draft.warId, draft.adminCapWarId, "Selected admin cap");
      break;

    case "commit-snapshot":
      appendIfInvalid(issues, isPositiveInteger(draft.warId), "War ID must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.systemId), "System ID must be a positive integer.");
      appendIfInvalid(issues, isUnsignedInteger(draft.pointsAwarded), "Points awarded must be an unsigned integer.");
      appendIfInvalid(issues, isObjectId(draft.configVersionId), "Config version object ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "War admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, hasEvenHexBytes(draft.snapshotHashHex), "Snapshot hash must be a valid even-length hex string.");
      appendWarMismatchIfKnown(issues, draft.warId, draft.adminCapWarId, "Selected admin cap");
      appendWarMismatchIfKnown(issues, draft.warId, draft.configWarId, "Selected config version");
      appendSystemMismatchIfKnown(issues, draft.systemId, draft.configSystemId, "Selected config version");
      appendIfInvalid(
        issues,
        draft.controllerTribeId === null || isUnsignedInteger(draft.controllerTribeId),
        "Controller tribe ID must be blank or an unsigned integer.",
      );
      break;

    case "end-war":
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, draft.endedAtMs > 0, "End time must be set.");
      break;

    case "update-war-end-time":
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, draft.newEndedAtMs > 0, "New end time must be set.");
      break;

    case "cancel-war-end":
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      break;

    case "set-win-margin":
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, isPositiveInteger(draft.winMargin), "Win margin must be greater than zero.");
      break;

    case "resolve-war":
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, Array.isArray(draft.tribeScores) && (draft.tribeScores as unknown[]).length > 0, "Tribe scores must be a non-empty array.");
      break;

    case "register-tribe":
      appendIfInvalid(issues, isObjectId(draft.registryId), "Registry ID must look like a Sui object ID.");
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, isPositiveInteger(draft.tribeId), "Tribe ID must be a positive integer.");
      appendIfInvalid(issues, draft.displayName.trim().length > 0, "Display name is required.");
      break;

    case "batch-phase-config":
      appendIfInvalid(issues, isObjectId(draft.adminCapId), "Admin cap ID must look like a Sui object ID.");
      appendIfInvalid(issues, draft.systems.length > 0, "At least one system must be included in the batch.");
      appendIfInvalid(issues, isPositiveInteger(draft.version), "Config version must be a positive integer.");
      appendIfInvalid(issues, isPositiveInteger(draft.defaultTickMinutes), "Default tick minutes must be a positive integer.");
      for (const sys of draft.systems) {
        appendIfInvalid(issues, isPositiveInteger(sys.systemId), `System ${sys.systemId}: system ID must be a positive integer.`);
        appendIfInvalid(issues, isPositiveInteger(sys.pointsPerTick), `System ${sys.systemId}: points per tick must be a positive integer.`);
        appendIfInvalid(
          issues,
          !sys.registerSystem || sys.displayName.trim().length > 0,
          `System ${sys.systemId}: display name is required when registering a new system.`,
        );
      }
      break;
  }

  return issues;
}

export function buildDraftPreview(draft: AdminDraft): DraftPreview {
  const blockingIssues = validateDraft(draft);

  switch (draft.kind) {
    case "create-war":
      return {
        title: "Create Lineage War",
        summary: [
          `War ${draft.warId}: ${draft.displayName} (${draft.slug})`,
          `Max supported tribes: ${draft.maxSupportedTribes}`,
          `Source of truth mode: ${draft.sourceOfTruthMode}`,
          `Win margin: ${draft.winMargin}`,
          `Created at: ${new Date(draft.createdAtMs).toLocaleString()}`,
        ],
        blockingIssues,
        warnings: [
          "This creates a shared WarRegistry and transfers the WarAdminCap to the connected wallet.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::admin::create_lineage_war`],
      };

    case "publish-defaults":
      return {
        title: "Publish initial defaults",
        summary: [
          `War ${draft.warId}, version ${draft.version}`,
          `Tick cadence: ${draft.defaultTickMinutes} minutes`,
          `Points per tick: ${draft.defaultPointsPerTick}`,
          `Margins: take ${draft.defaultTakeMargin}, hold ${draft.defaultHoldMargin}, neutral minimum ${draft.defaultNeutralMinTotalPresence}`,
          `Storage mode: ${draft.defaultStorageRequirementMode}`,
          `Effective from: ${new Date(draft.effectiveFromMs).toLocaleString()}`,
        ],
        blockingIssues,
        warnings: ["Defaults are chain-backed once published. Future changes should be published as new versions."],
        contractCalls: [`${packageIdOrPlaceholder()}::admin::publish_initial_defaults`],
      };

    case "upsert-system-config":
      return {
        title: draft.registerSystem ? "Register system and publish config" : "Publish new system config version",
        summary: [
          `War ${draft.warId}, system ${draft.systemId} (${draft.displayName || "display name unchanged in config-only mode"})`,
          `Version ${draft.version}, enabled=${String(draft.systemEnabled)}, priority=${draft.priorityClass}`,
          `Points/tick=${draft.pointsPerTick}, tick override=${draft.tickMinutesOverride ?? "inherit war default"}`,
          `Margins: take ${draft.takeMargin}, hold ${draft.holdMargin}, neutral minimum ${draft.neutralMinTotalPresence}, tied contested=${String(draft.contestedWhenTied)}`,
          `Storage mode=${draft.storageRequirementMode}, minimum total item count=${draft.minimumTotalItemCount}`,
          `Public rule label=${draft.displayCopy.displayRuleLabel || "-"}`,
          `Public rule description=${draft.displayCopy.displayRuleDescription || "-"}`,
          `Effective from: ${new Date(draft.effectiveFromMs).toLocaleString()}`,
          ...previewLinesForRuleSet(draft),
        ],
        blockingIssues,
        warnings: [
          draft.registerSystem
            ? "This path registers a shared WarSystem and publishes a shared SystemConfigVersion."
            : "Config-only mode assumes the system is already registered. The contract does not expose in-place removal of existing dynamic-field rule flags.",
          "Public display copy is editorial only. It is not published on chain and must be carried by the verifier/public display manifest.",
        ],
        contractCalls: [
          draft.registerSystem
            ? `${packageIdOrPlaceholder()}::systems::register_system`
            : `${packageIdOrPlaceholder()}::config::publish_system_config_version`,
          `${packageIdOrPlaceholder()}::config::publish_system_config_version`,
          `${packageIdOrPlaceholder()}::config::allow_*`,
          `${packageIdOrPlaceholder()}::config::share_system_config_version`,
        ],
      };

    case "schedule-system-change":
      return {
        title: "Schedule system rule change",
        summary: [
          `War ${draft.warId}, change ${draft.changeId}, target system ${draft.targetSystemId}`,
          `Config object ID: ${draft.configObjectId}`,
          `Effective from: ${new Date(draft.effectiveFromMs).toLocaleString()}`,
          `Created at: ${new Date(draft.createdAtMs).toLocaleString()}`,
        ],
        blockingIssues,
        warnings: [
          "Scheduling is separate from config publication today. You must reference an already-published SystemConfigVersion object ID.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::admin::schedule_system_rule_change`],
      };

    case "toggle-war":
      return {
        title: draft.action === "pause" ? "Pause war" : "Resume war",
        summary: [`War ${draft.warId}`, `Registry: ${draft.registryId}`],
        blockingIssues,
        warnings: ["This toggles the registry enabled flag only. It does not rewrite historical snapshots or config."],
        contractCalls: [`${packageIdOrPlaceholder()}::registry::${draft.action === "pause" ? "pause_war" : "resume_war"}`],
      };

    case "commit-snapshot":
      return {
        title: "Commit verifier snapshot record",
        summary: [
          `War ${draft.warId}, system ${draft.systemId}`,
          `Tick timestamp: ${new Date(draft.tickTimestampMs).toLocaleString()}`,
          `State=${draft.state}, controller tribe=${draft.controllerTribeId ?? "none"}, points awarded=${draft.pointsAwarded}`,
          `Config version ID: ${draft.configVersionId}`,
          `Snapshot hash: ${draft.snapshotHashHex}`,
        ],
        blockingIssues,
        warnings: [
          "Snapshot submission is optional here and is intended for verifier-produced commits, not manual score editing.",
          "If the selected config or admin cap belongs to a different war/system, this preview will block submission instead of guessing.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::admin::commit_snapshot_record`],
      };

    case "end-war":
      return {
        title: "Schedule war end",
        summary: [
          `War ${draft.warId}`,
          `Registry: ${draft.registryId}`,
          `End time: ${new Date(draft.endedAtMs).toLocaleString()}`,
        ],
        blockingIssues,
        warnings: [
          "This schedules the war to end. Once the end time passes, the war is permanently over.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::admin::end_lineage_war`],
      };

    case "update-war-end-time":
      return {
        title: "Update war end time",
        summary: [
          `War ${draft.warId}`,
          `Registry: ${draft.registryId}`,
          `New end time: ${new Date(draft.newEndedAtMs).toLocaleString()}`,
        ],
        blockingIssues,
        warnings: [
          "This changes the scheduled end time. The war must already have a scheduled end.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::registry::update_war_end_time`],
      };

    case "cancel-war-end":
      return {
        title: "Cancel scheduled war end",
        summary: [
          `War ${draft.warId}`,
          `Registry: ${draft.registryId}`,
        ],
        blockingIssues,
        warnings: [
          "This removes the scheduled end time and re-enables the war. Scoring and config changes resume.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::registry::cancel_war_end`],
      };

    case "set-win-margin":
      return {
        title: "Set win margin",
        summary: [
          `War ${draft.warId}`,
          `Registry: ${draft.registryId}`,
          `Win margin: ${draft.winMargin}`,
        ],
        blockingIssues,
        warnings: [
          "This creates a permanent on-chain WinMarginRecord. The margin determines whether resolution produces a victory or draw.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::registry::set_win_margin`],
      };

    case "resolve-war": {
      const scores = Array.isArray(draft.tribeScores) ? draft.tribeScores as Array<{ tribeId: number; score: number }> : [];
      return {
        title: "Resolve war",
        summary: [
          `War ${draft.warId}`,
          `Registry: ${draft.registryId}`,
          `Tribe scores: ${scores.map((s) => `tribe ${s.tribeId} = ${s.score}`).join(", ") || "none"}`,
        ],
        blockingIssues,
        warnings: [
          "This creates a permanent on-chain WarResolution object. The contract compares scores against the win margin to determine victory or draw. This cannot be undone.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::registry::resolve_war`],
      };
    }

    case "register-tribe":
      return {
        title: "Register tribe",
        summary: [
          `War ${draft.warId}`,
          `Registry: ${draft.registryId}`,
          `Tribe ID: ${draft.tribeId}`,
          `Display name: ${draft.displayName}`,
        ],
        blockingIssues,
        warnings: [
          "This registers a tribe as a dynamic field on the WarRegistry. The tribe ID must match the EVE Frontier tribe ID.",
        ],
        contractCalls: [`${packageIdOrPlaceholder()}::admin::register_tribe`],
      };

    case "batch-phase-config": {
      const pkg = packageIdOrPlaceholder();
      const newSystems = draft.systems.filter((s) => s.registerSystem);
      const calls: string[] = [];
      calls.push(`${pkg}::config::publish_war_config_version (x1)`);
      calls.push(`${pkg}::config::share_war_config_version (x1)`);
      calls.push(`${pkg}::config::publish_phase_config (x1)`);
      calls.push(`${pkg}::config::share_phase_config (x1)`);
      if (newSystems.length > 0) {
        calls.push(`${pkg}::systems::register_system (x${newSystems.length})`);
      }
      calls.push(`${pkg}::config::publish_system_config_version (x${draft.systems.length})`);
      calls.push(`${pkg}::config::allow_* (per-system rules)`);
      calls.push(`${pkg}::config::share_system_config_version (x${draft.systems.length})`);
      return {
        title: `Phase ${draft.phaseNumber} batch config`,
        summary: [
          `War ${draft.warId}, phase ${draft.phaseNumber}, version ${draft.version}`,
          `${draft.systems.length} system(s), ${newSystems.length} new registration(s)`,
          `Default tick: ${draft.defaultTickMinutes} minutes`,
          `Effective from: ${new Date(draft.effectiveFromMs).toLocaleString()}`,
          ...draft.systems.map((s) => `  System ${s.systemId} (${s.displayName}): ${s.pointsPerTick} pts/tick, take=${s.takeMargin}, hold=${s.holdMargin}`),
        ],
        blockingIssues,
        warnings: [
          "This submits a single transaction that publishes a WarConfigVersion, a PhaseConfig, and SystemConfigVersion(s) for each system.",
          newSystems.length > 0
            ? `${newSystems.length} new WarSystem object(s) will be created and shared.`
            : "No new systems are being registered; all systems are assumed to already exist.",
        ],
        contractCalls: calls,
      };
    }
  }
}

export function buildTransactionForDraft(draft: AdminDraft, sender: string): Transaction {
  const blockingIssues = validateDraft(draft);
  if (blockingIssues.length > 0) {
    throw new Error(blockingIssues.join(" "));
  }

  const packageId = requirePackageId();
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudgetIfNotSet(100_000_000);

  switch (draft.kind) {
    case "create-war": {
      const adminCap = tx.moveCall({
        target: `${packageId}::admin::create_lineage_war`,
        arguments: [
          tx.pure.u64(draft.warId),
          tx.pure.string(draft.slug),
          tx.pure.string(draft.displayName),
          tx.pure.u16(draft.maxSupportedTribes),
          tx.pure.u8(draft.sourceOfTruthMode),
          tx.pure.u64(draft.winMargin),
          tx.pure.u64(draft.createdAtMs),
        ],
      });
      tx.transferObjects([adminCap], tx.pure.address(sender));
      return tx;
    }

    case "publish-defaults":
      tx.moveCall({
        target: `${packageId}::admin::publish_initial_defaults`,
        arguments: [
          tx.pure.u64(draft.warId),
          tx.pure.u64(draft.version),
          tx.pure.u16(draft.defaultTickMinutes),
          tx.pure.u64(draft.defaultPointsPerTick),
          tx.pure.u16(draft.defaultTakeMargin),
          tx.pure.u16(draft.defaultHoldMargin),
          tx.pure.u16(draft.defaultNeutralMinTotalPresence),
          tx.pure.bool(draft.defaultContestedWhenTied),
          tx.pure.u8(draft.defaultStorageRequirementMode),
          tx.pure.u64(draft.effectiveFromMs),
          tx.pure.option("u64", draft.effectiveUntilMs),
          tx.object(draft.adminCapId),
        ],
      });
      return tx;

    case "upsert-system-config": {
      if (draft.registerSystem) {
        const system = tx.moveCall({
          target: `${packageId}::systems::register_system`,
          arguments: [
            tx.pure.u64(draft.warId),
            tx.pure.u64(draft.systemId),
            tx.pure.string(draft.displayName),
            tx.pure.u8(draft.priorityClass),
            tx.pure.bool(draft.systemEnabled),
            tx.object(draft.adminCapId),
          ],
        });
        tx.moveCall({
          target: `${packageId}::systems::share_system`,
          arguments: [system],
        });
      }

      const cfg = tx.moveCall({
        target: `${packageId}::config::publish_system_config_version`,
        arguments: [
          tx.pure.u64(draft.warId),
          tx.pure.u64(draft.systemId),
          tx.pure.u64(draft.version),
          tx.pure.bool(draft.systemEnabled),
          tx.pure.u64(draft.pointsPerTick),
          tx.pure.option("u16", draft.tickMinutesOverride),
          tx.pure.u16(draft.takeMargin),
          tx.pure.u16(draft.holdMargin),
          tx.pure.u16(draft.neutralMinTotalPresence),
          tx.pure.bool(draft.contestedWhenTied),
          tx.pure.u8(draft.storageRequirementMode),
          tx.pure.u64(draft.minimumTotalItemCount),
          tx.pure.u64(draft.effectiveFromMs),
          tx.pure.option("u64", draft.effectiveUntilMs),
          tx.object(draft.adminCapId),
        ],
      });

      for (const family of [...new Set(draft.ruleSet.allowedAssemblyFamilies)]) {
        tx.moveCall({
          target: `${packageId}::config::allow_assembly_family`,
          arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u8(family), tx.pure.u64(1)],
        });
      }

      for (const typeId of [...new Set(draft.ruleSet.allowedAssemblyTypeIds)]) {
        tx.moveCall({
          target: `${packageId}::config::allow_assembly_type`,
          arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u64(typeId), tx.pure.u64(1)],
        });
      }

      for (const typeId of [...new Set(draft.ruleSet.allowedStorageTypeIds)]) {
        tx.moveCall({
          target: `${packageId}::config::allow_storage_type`,
          arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u64(typeId)],
        });
      }

      for (const typeId of [...new Set(draft.ruleSet.requiredItemTypeIds)]) {
        tx.moveCall({
          target: `${packageId}::config::require_item_type`,
          arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u64(typeId)],
        });
      }

      tx.moveCall({
        target: `${packageId}::config::share_system_config_version`,
        arguments: [cfg],
      });
      return tx;
    }

    case "schedule-system-change":
      tx.moveCall({
        target: `${packageId}::admin::schedule_system_rule_change`,
        arguments: [
          tx.pure.u64(draft.warId),
          tx.pure.u64(draft.changeId),
          tx.pure.u64(draft.targetSystemId),
          tx.pure.id(draft.configObjectId),
          tx.pure.u64(draft.effectiveFromMs),
          tx.pure.u64(draft.createdAtMs),
          tx.object(draft.adminCapId),
        ],
      });
      return tx;

    case "toggle-war":
      tx.moveCall({
        target: `${packageId}::registry::${draft.action === "pause" ? "pause_war" : "resume_war"}`,
        arguments: [tx.object(draft.registryId), tx.object(draft.adminCapId), tx.object("0x6")],
      });
      return tx;

    case "commit-snapshot":
      tx.moveCall({
        target: `${packageId}::admin::commit_snapshot_record`,
        arguments: [
          tx.pure.u64(draft.warId),
          tx.pure.u64(draft.systemId),
          tx.pure.u64(draft.tickTimestampMs),
          tx.pure.u8(draft.state),
          tx.pure.option("u32", draft.controllerTribeId),
          tx.pure.u64(draft.pointsAwarded),
          tx.pure.id(draft.configVersionId),
          tx.pure.vector("u8", hexToBytes(draft.snapshotHashHex)),
          tx.object(draft.adminCapId),
        ],
      });
      return tx;

    case "end-war":
      tx.moveCall({
        target: `${packageId}::admin::end_lineage_war`,
        arguments: [
          tx.object(draft.registryId),
          tx.object(draft.adminCapId),
          tx.pure.u64(draft.endedAtMs),
        ],
      });
      return tx;

    case "update-war-end-time":
      tx.moveCall({
        target: `${packageId}::registry::update_war_end_time`,
        arguments: [
          tx.object(draft.registryId),
          tx.object(draft.adminCapId),
          tx.pure.u64(draft.newEndedAtMs),
        ],
      });
      return tx;

    case "cancel-war-end":
      tx.moveCall({
        target: `${packageId}::registry::cancel_war_end`,
        arguments: [
          tx.object(draft.registryId),
          tx.object(draft.adminCapId),
        ],
      });
      return tx;

    case "set-win-margin":
      tx.moveCall({
        target: `${packageId}::registry::set_win_margin`,
        arguments: [
          tx.object(draft.registryId),
          tx.object(draft.adminCapId),
          tx.pure.u64(draft.winMargin),
          tx.object("0x6"),
        ],
      });
      return tx;

    case "resolve-war": {
      const scores = draft.tribeScores as Array<{ tribeId: number; score: number }>;
      const tribeIds = scores.map((s) => s.tribeId);
      const scoreValues = scores.map((s) => s.score);
      tx.moveCall({
        target: `${packageId}::registry::resolve_war`,
        arguments: [
          tx.object(draft.registryId),
          tx.object(draft.adminCapId),
          tx.pure.vector("u32", tribeIds),
          tx.pure.vector("u64", scoreValues),
          tx.object("0x6"),
        ],
      });
      return tx;
    }

    case "register-tribe":
      tx.moveCall({
        target: `${packageId}::admin::register_tribe`,
        arguments: [
          tx.object(draft.registryId),
          tx.object(draft.adminCapId),
          tx.pure.u32(draft.tribeId),
          tx.pure.string(draft.displayName),
          tx.object("0x6"),
        ],
      });
      return tx;

    case "batch-phase-config": {
      const warId = typeof draft.warId === "string" ? Number(draft.warId) : draft.warId;
      const firstSys = draft.systems[0];

      const warCfg = tx.moveCall({
        target: `${packageId}::config::publish_war_config_version`,
        arguments: [
          tx.pure.u64(warId),
          tx.pure.u64(draft.version),
          tx.pure.u16(draft.defaultTickMinutes),
          tx.pure.u64(firstSys?.pointsPerTick ?? 1),
          tx.pure.u16(firstSys?.takeMargin ?? 1),
          tx.pure.u16(firstSys?.holdMargin ?? 1),
          tx.pure.u16(firstSys?.neutralMinTotalPresence ?? 0),
          tx.pure.bool(firstSys?.contestedWhenTied ?? false),
          tx.pure.u8(firstSys?.storageRequirementMode ?? 0),
          tx.pure.u64(draft.effectiveFromMs),
          tx.pure.option("u64", draft.effectiveUntilMs),
          tx.object(draft.adminCapId),
        ],
      });
      tx.moveCall({
        target: `${packageId}::config::share_war_config_version`,
        arguments: [warCfg],
      });

      const phaseCfg = tx.moveCall({
        target: `${packageId}::config::publish_phase_config`,
        arguments: [
          tx.pure.u64(warId),
          tx.pure.u64(draft.phaseNumber),
          tx.pure.string(`Phase ${draft.phaseNumber}`),
          tx.pure.option("u16", null),
          tx.pure.u64(10_000),
          tx.pure.u64(draft.effectiveFromMs),
          tx.pure.option("u64", draft.effectiveUntilMs),
          tx.object(draft.adminCapId),
        ],
      });
      tx.moveCall({
        target: `${packageId}::config::share_phase_config`,
        arguments: [phaseCfg],
      });

      for (const sys of draft.systems) {
        if (sys.registerSystem) {
          const system = tx.moveCall({
            target: `${packageId}::systems::register_system`,
            arguments: [
              tx.pure.u64(warId),
              tx.pure.u64(sys.systemId),
              tx.pure.string(sys.displayName),
              tx.pure.u8(sys.priorityClass ?? 0),
              tx.pure.bool(sys.systemEnabled ?? true),
              tx.object(draft.adminCapId),
            ],
          });
          tx.moveCall({
            target: `${packageId}::systems::share_system`,
            arguments: [system],
          });
        }

        const cfg = tx.moveCall({
          target: `${packageId}::config::publish_system_config_version`,
          arguments: [
            tx.pure.u64(warId),
            tx.pure.u64(sys.systemId),
            tx.pure.u64(draft.version),
            tx.pure.bool(sys.systemEnabled ?? true),
            tx.pure.u64(sys.pointsPerTick),
            tx.pure.option("u16", null),
            tx.pure.u16(sys.takeMargin),
            tx.pure.u16(sys.holdMargin),
            tx.pure.u16(sys.neutralMinTotalPresence),
            tx.pure.bool(sys.contestedWhenTied),
            tx.pure.u8(sys.storageRequirementMode),
            tx.pure.u64(sys.minimumTotalItemCount),
            tx.pure.u64(draft.effectiveFromMs),
            tx.pure.option("u64", draft.effectiveUntilMs),
            tx.object(draft.adminCapId),
          ],
        });

        for (const f of sys.ruleSet.allowedAssemblyFamilies) {
          tx.moveCall({
            target: `${packageId}::config::allow_assembly_family`,
            arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u8(f.family), tx.pure.u64(f.weight ?? 1)],
          });
        }

        for (const t of sys.ruleSet.allowedAssemblyTypeIds) {
          tx.moveCall({
            target: `${packageId}::config::allow_assembly_type`,
            arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u64(t.typeId), tx.pure.u64(t.weight ?? 1)],
          });
        }

        for (const typeId of [...new Set(sys.ruleSet.allowedStorageTypeIds)]) {
          tx.moveCall({
            target: `${packageId}::config::allow_storage_type`,
            arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u64(typeId)],
          });
        }

        for (const typeId of [...new Set(sys.ruleSet.requiredItemTypeIds)]) {
          tx.moveCall({
            target: `${packageId}::config::require_item_type`,
            arguments: [cfg, tx.object(draft.adminCapId), tx.pure.u64(typeId)],
          });
        }

        tx.moveCall({
          target: `${packageId}::config::share_system_config_version`,
          arguments: [cfg],
        });
      }

      return tx;
    }
  }
}

export function extractCreatedObjectsByType(result: unknown): {
  digest: string;
  createdObjectIds: string[];
  createdByType: Record<string, string[]>;
} {
  const response = result as
    | {
        $kind?: "Transaction";
        Transaction?: {
          digest?: string;
          effects?: {
            changedObjects?: Array<{ objectId?: string; idOperation?: string }>;
            created?: Array<{ reference?: { objectId?: string }; type?: string }>;
          };
          objectTypes?: Record<string, string>;
        };
      }
    | {
        $kind?: "FailedTransaction";
        FailedTransaction?: {
          digest?: string;
          effects?: {
            changedObjects?: Array<{ objectId?: string; idOperation?: string }>;
            created?: Array<{ reference?: { objectId?: string }; type?: string }>;
          };
          objectTypes?: Record<string, string>;
        };
      }
    | {
        digest?: string;
      };

  const transaction = (
    "$kind" in response && response.$kind === "FailedTransaction"
      ? response.FailedTransaction
      : "$kind" in response && response.$kind === "Transaction"
        ? response.Transaction
        : response
  ) as {
    digest?: string;
    effects?: {
      changedObjects?: Array<{ objectId?: string; idOperation?: string }>;
      created?: Array<{ reference?: { objectId?: string }; type?: string }>;
    };
    objectTypes?: Record<string, string>;
  };

  const createdObjectIds: string[] = [];
  const createdByType: Record<string, string[]> = {};
  const seenObjectIds = new Set<string>();

  const registerCreatedObject = (objectId: string | undefined, explicitType?: string) => {
    if (!objectId || seenObjectIds.has(objectId)) {
      return;
    }

    seenObjectIds.add(objectId);
    createdObjectIds.push(objectId);

    const key = explicitType ?? transaction?.objectTypes?.[objectId] ?? "unknown";
    createdByType[key] ??= [];
    createdByType[key].push(objectId);
  };

  for (const change of transaction?.effects?.changedObjects ?? []) {
    if (change.idOperation !== "Created" || !change.objectId) {
      continue;
    }

    registerCreatedObject(change.objectId);
  }

  for (const created of transaction?.effects?.created ?? []) {
    registerCreatedObject(created.reference?.objectId, created.type);
  }

  return {
    digest: transaction?.digest ?? "unknown",
    createdObjectIds,
    createdByType,
  };
}

export function extractExecutionRecord(result: unknown): ExecutionRecord {
  const extracted = extractCreatedObjectsByType(result);
  return {
    ...extracted,
    timestampMs: Date.now(),
  };
}
