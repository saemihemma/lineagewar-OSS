/// View-only accessors: read-only functions for querying war and system state.
///
/// Provides convenient getter functions that combine access across registry,
/// config, systems, and snapshots modules.
module lineage_war::view;

use std::option::Option;
use lineage_war::{config, registry, snapshots, systems};

/// Returns whether the war is enabled.
public fun war_enabled(registry: &registry::WarRegistry): bool {
    registry::is_enabled(registry)
}

/// Returns the source of truth mode.
public fun war_source_of_truth_mode(registry: &registry::WarRegistry): u8 {
    registry::source_of_truth_mode(registry)
}

/// Returns whether a system is enabled.
public fun system_enabled(system: &systems::WarSystem): bool {
    systems::enabled(system)
}

/// Returns the system ID.
public fun system_id(system: &systems::WarSystem): u64 {
    systems::system_id(system)
}

/// Returns points per tick from system config.
public fun system_config_points_per_tick(cfg: &config::SystemConfigVersion): u64 {
    config::points_per_tick(cfg)
}

/// Returns take margin from system config.
public fun system_config_take_margin(cfg: &config::SystemConfigVersion): u16 {
    config::take_margin(cfg)
}

/// Returns hold margin from system config.
public fun system_config_hold_margin(cfg: &config::SystemConfigVersion): u16 {
    config::hold_margin(cfg)
}

/// Returns the control state from a snapshot.
public fun snapshot_state(snapshot: &snapshots::SnapshotRecord): u8 {
    snapshots::state(snapshot)
}

/// Returns the controlling tribe ID from a snapshot.
public fun snapshot_controller(snapshot: &snapshots::SnapshotRecord): Option<u32> {
    snapshots::controller_tribe_id(snapshot)
}
