module lineage_war::registry;

use std::string::String;
use sui::event;
use lineage_war::rules;

#[error(code = 0)]
const EInvalidWarId: vector<u8> = b"War id must be non-zero";
#[error(code = 1)]
const EInvalidSourceOfTruthMode: vector<u8> = b"Invalid source of truth mode";
#[error(code = 2)]
const EAdminCapMismatch: vector<u8> = b"Admin cap does not match war";

public struct WarCreatedEvent has copy, drop {
    war_id: u64,
    source_of_truth_mode: u8,
}

public struct WarPausedEvent has copy, drop {
    war_id: u64,
}

public struct WarResumedEvent has copy, drop {
    war_id: u64,
}

public struct WarRegistry has key {
    id: UID,
    war_id: u64,
    slug: String,
    display_name: String,
    enabled: bool,
    max_supported_tribes: u16,
    source_of_truth_mode: u8,
    created_at_ms: u64,
    current_war_config_version: u64,
}

public struct WarAdminCap has key, store {
    id: UID,
    war_id: u64,
}

public fun create_war(
    war_id: u64,
    slug: String,
    display_name: String,
    max_supported_tribes: u16,
    source_of_truth_mode: u8,
    created_at_ms: u64,
    ctx: &mut TxContext,
): (WarRegistry, WarAdminCap) {
    assert!(war_id != 0, EInvalidWarId);
    assert!(rules::is_valid_source_of_truth_mode(source_of_truth_mode), EInvalidSourceOfTruthMode);

    let registry = WarRegistry {
        id: object::new(ctx),
        war_id,
        slug,
        display_name,
        enabled: true,
        max_supported_tribes,
        source_of_truth_mode,
        created_at_ms,
        current_war_config_version: 0,
    };
    let admin_cap = WarAdminCap {
        id: object::new(ctx),
        war_id,
    };

    event::emit(WarCreatedEvent {
        war_id,
        source_of_truth_mode,
    });

    (registry, admin_cap)
}

public fun share_war_registry(registry: WarRegistry) {
    transfer::share_object(registry);
}

public fun pause_war(registry: &mut WarRegistry, admin_cap: &WarAdminCap) {
    assert_admin(admin_cap, registry.war_id);
    registry.enabled = false;
    event::emit(WarPausedEvent { war_id: registry.war_id });
}

public fun resume_war(registry: &mut WarRegistry, admin_cap: &WarAdminCap) {
    assert_admin(admin_cap, registry.war_id);
    registry.enabled = true;
    event::emit(WarResumedEvent { war_id: registry.war_id });
}

public fun bump_war_config_version(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    version: u64,
) {
    assert_admin(admin_cap, registry.war_id);
    registry.current_war_config_version = version;
}

public fun war_id(registry: &WarRegistry): u64 {
    registry.war_id
}

public fun source_of_truth_mode(registry: &WarRegistry): u8 {
    registry.source_of_truth_mode
}

public fun is_enabled(registry: &WarRegistry): bool {
    registry.enabled
}

public fun war_id_from_admin_cap(admin_cap: &WarAdminCap): u64 {
    admin_cap.war_id
}

fun assert_admin(admin_cap: &WarAdminCap, war_id: u64) {
    assert!(admin_cap.war_id == war_id, EAdminCapMismatch);
}
