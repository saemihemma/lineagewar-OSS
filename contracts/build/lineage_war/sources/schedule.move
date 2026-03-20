module lineage_war::schedule;

use sui::event;
use lineage_war::{registry, rules};

#[error(code = 0)]
const EInvalidWarId: vector<u8> = b"War id must be non-zero";
#[error(code = 1)]
const EInvalidChangeId: vector<u8> = b"Change id must be non-zero";
#[error(code = 2)]
const EInvalidTargetKind: vector<u8> = b"Invalid target kind";
#[error(code = 3)]
const EAdminCapMismatch: vector<u8> = b"Admin cap does not match war";
#[error(code = 4)]
const EChangeAlreadyCancelled: vector<u8> = b"Scheduled change is already cancelled";

public struct ScheduledChangePublishedEvent has copy, drop {
    war_id: u64,
    change_id: u64,
    target_kind: u8,
    target_id: u64,
    effective_from_ms: u64,
}

public struct ScheduledChangeCancelledEvent has copy, drop {
    war_id: u64,
    change_id: u64,
}

public struct ScheduledChange has key, store {
    id: UID,
    war_id: u64,
    change_id: u64,
    target_kind: u8,
    target_id: u64,
    config_object_id: ID,
    effective_from_ms: u64,
    created_at_ms: u64,
    cancelled: bool,
}

public fun schedule_config_change(
    war_id: u64,
    change_id: u64,
    target_kind: u8,
    target_id: u64,
    config_object_id: ID,
    effective_from_ms: u64,
    created_at_ms: u64,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
): ScheduledChange {
    assert!(war_id != 0, EInvalidWarId);
    assert!(change_id != 0, EInvalidChangeId);
    assert!(rules::is_valid_target_kind(target_kind), EInvalidTargetKind);
    assert!(registry::war_id_from_admin_cap(admin_cap) == war_id, EAdminCapMismatch);

    let change = ScheduledChange {
        id: object::new(ctx),
        war_id,
        change_id,
        target_kind,
        target_id,
        config_object_id,
        effective_from_ms,
        created_at_ms,
        cancelled: false,
    };

    event::emit(ScheduledChangePublishedEvent {
        war_id,
        change_id,
        target_kind,
        target_id,
        effective_from_ms,
    });

    change
}

public fun cancel_scheduled_change(
    change: &mut ScheduledChange,
    admin_cap: &registry::WarAdminCap,
) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == change.war_id, EAdminCapMismatch);
    assert!(!change.cancelled, EChangeAlreadyCancelled);
    change.cancelled = true;
    event::emit(ScheduledChangeCancelledEvent {
        war_id: change.war_id,
        change_id: change.change_id,
    });
}

public fun share_scheduled_change(change: ScheduledChange) {
    transfer::share_object(change);
}
