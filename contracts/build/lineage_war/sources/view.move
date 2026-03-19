module lineage_war::view;

use std::option::Option;
use lineage_war::{config, registry, snapshots, systems};

public fun war_enabled(registry: &registry::WarRegistry): bool {
    registry::is_enabled(registry)
}

public fun war_source_of_truth_mode(registry: &registry::WarRegistry): u8 {
    registry::source_of_truth_mode(registry)
}

public fun system_enabled(system: &systems::WarSystem): bool {
    systems::enabled(system)
}

public fun system_id(system: &systems::WarSystem): u64 {
    systems::system_id(system)
}

public fun system_config_points_per_tick(cfg: &config::SystemConfigVersion): u64 {
    config::points_per_tick(cfg)
}

public fun system_config_take_margin(cfg: &config::SystemConfigVersion): u16 {
    config::take_margin(cfg)
}

public fun system_config_hold_margin(cfg: &config::SystemConfigVersion): u16 {
    config::hold_margin(cfg)
}

public fun snapshot_state(snapshot: &snapshots::SnapshotRecord): u8 {
    snapshots::state(snapshot)
}

public fun snapshot_controller(snapshot: &snapshots::SnapshotRecord): Option<u32> {
    snapshots::controller_tribe_id(snapshot)
}
