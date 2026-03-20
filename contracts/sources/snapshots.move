/// Snapshot records: system state commits at specific timestamps with control and scoring.
///
/// Manages SnapshotRecord (key, store). Admin-operated via WarAdminCap authorization.
/// Records system state, controller, and points awarded for each tick.
module lineage_war::snapshots;

use std::option::Option;
use sui::event;
use lineage_war::{registry, rules};

#[error(code = 0)]
const EInvalidWarId: vector<u8> = b"War id must be non-zero";
#[error(code = 1)]
const EInvalidSystemId: vector<u8> = b"System id must be non-zero";
#[error(code = 2)]
const EInvalidControlState: vector<u8> = b"Invalid control state";
#[error(code = 3)]
const EAdminCapMismatch: vector<u8> = b"Admin cap does not match war";

public struct SnapshotCommittedEvent has copy, drop {
    war_id: u64,
    system_id: u64,
    tick_timestamp_ms: u64,
    state: u8,
    controller_tribe_id: u32,
    points_awarded: u64,
}

public struct SnapshotRecord has key, store {
    id: UID,
    war_id: u64,
    system_id: u64,
    tick_timestamp_ms: u64,
    state: u8,
    controller_tribe_id: Option<u32>,
    points_awarded: u64,
    config_version_id: ID,
    snapshot_hash: vector<u8>,
}

/// Commits a snapshot of system state at a tick with control and points information.
public fun commit_snapshot(
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
): SnapshotRecord {
    assert!(war_id != 0, EInvalidWarId);
    assert!(system_id != 0, EInvalidSystemId);
    assert!(rules::is_valid_control_state(state), EInvalidControlState);
    assert!(registry::war_id_from_admin_cap(admin_cap) == war_id, EAdminCapMismatch);

    let snapshot = SnapshotRecord {
        id: object::new(ctx),
        war_id,
        system_id,
        tick_timestamp_ms,
        state,
        controller_tribe_id,
        points_awarded,
        config_version_id,
        snapshot_hash,
    };

    event::emit(SnapshotCommittedEvent {
        war_id,
        system_id,
        tick_timestamp_ms,
        state,
        controller_tribe_id: option_u32_or_zero(&snapshot.controller_tribe_id),
        points_awarded,
    });

    snapshot
}

/// Shares a snapshot record as a shared object.
public fun share_snapshot(snapshot: SnapshotRecord) {
    transfer::share_object(snapshot);
}

fun option_u32_or_zero(value: &Option<u32>): u32 {
    if (std::option::is_some(value)) {
        *std::option::borrow(value)
    } else {
        0
    }
}

/// Returns the control state of the snapshot.
public fun state(snapshot: &SnapshotRecord): u8 {
    snapshot.state
}

/// Returns the controlling tribe ID if any.
public fun controller_tribe_id(snapshot: &SnapshotRecord): Option<u32> {
    snapshot.controller_tribe_id
}
