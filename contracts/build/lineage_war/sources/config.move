module lineage_war::config;

use std::option::Option;
use sui::{dynamic_field as df, event};
use lineage_war::{registry, rules};

#[error(code = 0)]
const EInvalidWarId: vector<u8> = b"War id must be non-zero";
#[error(code = 1)]
const EInvalidSystemId: vector<u8> = b"System id must be non-zero";
#[error(code = 2)]
const EInvalidPhaseId: vector<u8> = b"Phase id must be non-zero";
#[error(code = 3)]
const EInvalidVersion: vector<u8> = b"Version must be non-zero";
#[error(code = 4)]
const EInvalidTickMinutes: vector<u8> = b"Tick minutes must be non-zero";
#[error(code = 5)]
const EInvalidPoints: vector<u8> = b"Points must be non-zero";
#[error(code = 6)]
const EInvalidAssemblyFamily: vector<u8> = b"Invalid assembly family";
#[error(code = 7)]
const EInvalidStorageRequirementMode: vector<u8> = b"Invalid storage requirement mode";
#[error(code = 8)]
const EAdminCapMismatch: vector<u8> = b"Admin cap does not match war";

public struct WarConfigPublishedEvent has copy, drop {
    war_id: u64,
    version: u64,
    effective_from_ms: u64,
}

public struct PhaseConfigPublishedEvent has copy, drop {
    war_id: u64,
    phase_id: u64,
    effective_from_ms: u64,
}

public struct SystemConfigPublishedEvent has copy, drop {
    war_id: u64,
    system_id: u64,
    version: u64,
    effective_from_ms: u64,
}

public struct WarConfigVersion has key, store {
    id: UID,
    war_id: u64,
    version: u64,
    default_tick_minutes: u16,
    default_points_per_tick: u64,
    default_take_margin: u16,
    default_hold_margin: u16,
    default_neutral_min_total_presence: u16,
    default_contested_when_tied: bool,
    default_storage_requirement_mode: u8,
    effective_from_ms: u64,
    effective_until_ms: Option<u64>,
}

public struct PhaseConfig has key, store {
    id: UID,
    war_id: u64,
    phase_id: u64,
    display_name: std::string::String,
    tick_minutes_override: Option<u16>,
    points_multiplier_bps: u64,
    effective_from_ms: u64,
    effective_until_ms: Option<u64>,
}

public struct SystemConfigVersion has key, store {
    id: UID,
    war_id: u64,
    system_id: u64,
    version: u64,
    enabled: bool,
    points_per_tick: u64,
    tick_minutes_override: Option<u16>,
    take_margin: u16,
    hold_margin: u16,
    neutral_min_total_presence: u16,
    contested_when_tied: bool,
    storage_requirement_mode: u8,
    minimum_total_item_count: u64,
    effective_from_ms: u64,
    effective_until_ms: Option<u64>,
}

public struct AllowedAssemblyFamilyKey has copy, drop, store { family: u8 }
public struct AllowedAssemblyTypeKey has copy, drop, store { type_id: u64 }
public struct AllowedStorageTypeKey has copy, drop, store { type_id: u64 }
public struct RequiredItemTypeKey has copy, drop, store { type_id: u64 }
public struct RuleFlag has store, drop {}

public fun publish_war_config_version(
    war_id: u64,
    version: u64,
    default_tick_minutes: u16,
    default_points_per_tick: u64,
    default_take_margin: u16,
    default_hold_margin: u16,
    default_neutral_min_total_presence: u16,
    default_contested_when_tied: bool,
    default_storage_requirement_mode: u8,
    effective_from_ms: u64,
    effective_until_ms: Option<u64>,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
): WarConfigVersion {
    assert!(war_id != 0, EInvalidWarId);
    assert!(version != 0, EInvalidVersion);
    assert!(default_tick_minutes != 0, EInvalidTickMinutes);
    assert!(default_points_per_tick != 0, EInvalidPoints);
    assert!(registry::war_id_from_admin_cap(admin_cap) == war_id, EAdminCapMismatch);
    assert!(
        rules::is_valid_storage_requirement_mode(default_storage_requirement_mode),
        EInvalidStorageRequirementMode
    );

    let cfg = WarConfigVersion {
        id: object::new(ctx),
        war_id,
        version,
        default_tick_minutes,
        default_points_per_tick,
        default_take_margin,
        default_hold_margin,
        default_neutral_min_total_presence,
        default_contested_when_tied,
        default_storage_requirement_mode,
        effective_from_ms,
        effective_until_ms,
    };

    event::emit(WarConfigPublishedEvent { war_id, version, effective_from_ms });
    cfg
}

public fun publish_phase_config(
    war_id: u64,
    phase_id: u64,
    display_name: std::string::String,
    tick_minutes_override: Option<u16>,
    points_multiplier_bps: u64,
    effective_from_ms: u64,
    effective_until_ms: Option<u64>,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
): PhaseConfig {
    assert!(war_id != 0, EInvalidWarId);
    assert!(phase_id != 0, EInvalidPhaseId);
    assert!(registry::war_id_from_admin_cap(admin_cap) == war_id, EAdminCapMismatch);

    let cfg = PhaseConfig {
        id: object::new(ctx),
        war_id,
        phase_id,
        display_name,
        tick_minutes_override,
        points_multiplier_bps,
        effective_from_ms,
        effective_until_ms,
    };

    event::emit(PhaseConfigPublishedEvent { war_id, phase_id, effective_from_ms });
    cfg
}

public fun publish_system_config_version(
    war_id: u64,
    system_id: u64,
    version: u64,
    enabled: bool,
    points_per_tick: u64,
    tick_minutes_override: Option<u16>,
    take_margin: u16,
    hold_margin: u16,
    neutral_min_total_presence: u16,
    contested_when_tied: bool,
    storage_requirement_mode: u8,
    minimum_total_item_count: u64,
    effective_from_ms: u64,
    effective_until_ms: Option<u64>,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
): SystemConfigVersion {
    assert!(war_id != 0, EInvalidWarId);
    assert!(system_id != 0, EInvalidSystemId);
    assert!(version != 0, EInvalidVersion);
    assert!(points_per_tick != 0, EInvalidPoints);
    assert!(registry::war_id_from_admin_cap(admin_cap) == war_id, EAdminCapMismatch);
    assert!(
        rules::is_valid_storage_requirement_mode(storage_requirement_mode),
        EInvalidStorageRequirementMode
    );

    let cfg = SystemConfigVersion {
        id: object::new(ctx),
        war_id,
        system_id,
        version,
        enabled,
        points_per_tick,
        tick_minutes_override,
        take_margin,
        hold_margin,
        neutral_min_total_presence,
        contested_when_tied,
        storage_requirement_mode,
        minimum_total_item_count,
        effective_from_ms,
        effective_until_ms,
    };

    event::emit(SystemConfigPublishedEvent {
        war_id,
        system_id,
        version,
        effective_from_ms,
    });
    cfg
}

public fun share_war_config_version(cfg: WarConfigVersion) {
    transfer::share_object(cfg);
}

public fun share_phase_config(cfg: PhaseConfig) {
    transfer::share_object(cfg);
}

public fun share_system_config_version(cfg: SystemConfigVersion) {
    transfer::share_object(cfg);
}

public fun allow_assembly_family(
    cfg: &mut SystemConfigVersion,
    admin_cap: &registry::WarAdminCap,
    family: u8,
) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == cfg.war_id, EAdminCapMismatch);
    assert!(rules::is_valid_assembly_family(family), EInvalidAssemblyFamily);
    set_rule_flag(&mut cfg.id, AllowedAssemblyFamilyKey { family });
}

public fun allow_assembly_type(
    cfg: &mut SystemConfigVersion,
    admin_cap: &registry::WarAdminCap,
    type_id: u64,
) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == cfg.war_id, EAdminCapMismatch);
    set_rule_flag(&mut cfg.id, AllowedAssemblyTypeKey { type_id });
}

public fun allow_storage_type(
    cfg: &mut SystemConfigVersion,
    admin_cap: &registry::WarAdminCap,
    type_id: u64,
) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == cfg.war_id, EAdminCapMismatch);
    set_rule_flag(&mut cfg.id, AllowedStorageTypeKey { type_id });
}

public fun require_item_type(
    cfg: &mut SystemConfigVersion,
    admin_cap: &registry::WarAdminCap,
    type_id: u64,
) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == cfg.war_id, EAdminCapMismatch);
    set_rule_flag(&mut cfg.id, RequiredItemTypeKey { type_id });
}

fun set_rule_flag<K: copy + drop + store>(id: &mut UID, key: K) {
    if (!df::exists_(id, copy key)) {
        df::add(id, key, RuleFlag {});
    };
}

public fun points_per_tick(cfg: &SystemConfigVersion): u64 {
    cfg.points_per_tick
}

public fun take_margin(cfg: &SystemConfigVersion): u16 {
    cfg.take_margin
}

public fun hold_margin(cfg: &SystemConfigVersion): u16 {
    cfg.hold_margin
}
