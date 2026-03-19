module lineage_war::admin;

use std::string::String;
use std::option::Option;
use lineage_war::{config, registry, schedule, snapshots, systems};

public fun create_lineage_war(
    war_id: u64,
    slug: String,
    display_name: String,
    max_supported_tribes: u16,
    source_of_truth_mode: u8,
    created_at_ms: u64,
    ctx: &mut TxContext,
): registry::WarAdminCap {
    let (war_registry, admin_cap) = registry::create_war(
        war_id,
        slug,
        display_name,
        max_supported_tribes,
        source_of_truth_mode,
        created_at_ms,
        ctx,
    );
    registry::share_war_registry(war_registry);
    admin_cap
}

public fun publish_initial_defaults(
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
) {
    let cfg = config::publish_war_config_version(
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
        admin_cap,
        ctx,
    );
    config::share_war_config_version(cfg);
}

public fun add_system_and_configure(
    war_id: u64,
    system_id: u64,
    display_name: String,
    priority_class: u8,
    system_enabled: bool,
    version: u64,
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
) {
    let system = systems::register_system(
        war_id,
        system_id,
        display_name,
        priority_class,
        system_enabled,
        admin_cap,
        ctx,
    );
    systems::share_system(system);

    let cfg = config::publish_system_config_version(
        war_id,
        system_id,
        version,
        system_enabled,
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
        admin_cap,
        ctx,
    );
    config::share_system_config_version(cfg);
}

public fun schedule_system_rule_change(
    war_id: u64,
    change_id: u64,
    target_system_id: u64,
    config_object_id: ID,
    effective_from_ms: u64,
    created_at_ms: u64,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
) {
    let change = schedule::schedule_config_change(
        war_id,
        change_id,
        2,
        target_system_id,
        config_object_id,
        effective_from_ms,
        created_at_ms,
        admin_cap,
        ctx,
    );
    schedule::share_scheduled_change(change);
}

public fun commit_snapshot_record(
    war_id: u64,
    system_id: u64,
    tick_timestamp_ms: u64,
    state: u8,
    controller_tribe_id: Option<u32>,
    points_awarded: u64,
    config_version_id: ID,
    snapshot_hash: vector<u8>,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
) {
    let snapshot = snapshots::commit_snapshot(
        war_id,
        system_id,
        tick_timestamp_ms,
        state,
        controller_tribe_id,
        points_awarded,
        config_version_id,
        snapshot_hash,
        admin_cap,
        ctx,
    );
    snapshots::share_snapshot(snapshot);
}
