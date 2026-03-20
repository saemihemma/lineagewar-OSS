module lineage_war::rules;

// Source of truth modes
const ON_CHAIN_ONLY: u8 = 0;
const PREFER_ON_CHAIN_FALLBACK_WORLD_API: u8 = 1;
const VERIFIER_REQUIRED: u8 = 2;
const TRUSTED_PUBLISHER_FALLBACK: u8 = 3;

// Assembly families
const ASSEMBLY_FAMILY_STORAGE_UNIT: u8 = 0;
const ASSEMBLY_FAMILY_GATE: u8 = 1;
const ASSEMBLY_FAMILY_TURRET: u8 = 2;
const ASSEMBLY_FAMILY_OTHER: u8 = 3;

// Storage requirement modes
const STORAGE_REQUIREMENT_NONE: u8 = 0;
const STORAGE_REQUIREMENT_NON_EMPTY: u8 = 1;
const STORAGE_REQUIREMENT_SPECIFIC_ITEMS: u8 = 2;
const STORAGE_REQUIREMENT_MINIMUM_TOTAL_QUANTITY: u8 = 3;

// Control states
const CONTROL_STATE_NEUTRAL: u8 = 0;
const CONTROL_STATE_CONTESTED: u8 = 1;
const CONTROL_STATE_CONTROLLED: u8 = 2;

// Schedule target kinds
const TARGET_KIND_WAR_CONFIG: u8 = 0;
const TARGET_KIND_PHASE_CONFIG: u8 = 1;
const TARGET_KIND_SYSTEM_CONFIG: u8 = 2;

public fun is_valid_source_of_truth_mode(mode: u8): bool {
    mode <= TRUSTED_PUBLISHER_FALLBACK
}

public fun is_valid_assembly_family(family: u8): bool {
    family <= ASSEMBLY_FAMILY_OTHER
}

public fun is_valid_storage_requirement_mode(mode: u8): bool {
    mode <= STORAGE_REQUIREMENT_MINIMUM_TOTAL_QUANTITY
}

public fun is_valid_control_state(state: u8): bool {
    state <= CONTROL_STATE_CONTROLLED
}

public fun is_valid_target_kind(target_kind: u8): bool {
    target_kind <= TARGET_KIND_SYSTEM_CONFIG
}
