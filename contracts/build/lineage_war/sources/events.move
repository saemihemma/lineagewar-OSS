module lineage_war::events;

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

public struct SystemRegisteredEvent has copy, drop {
    war_id: u64,
    system_id: u64,
}

public struct SystemConfigPublishedEvent has copy, drop {
    war_id: u64,
    system_id: u64,
    version: u64,
    effective_from_ms: u64,
}

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

public struct SnapshotCommittedEvent has copy, drop {
    war_id: u64,
    system_id: u64,
    tick_timestamp_ms: u64,
    state: u8,
    controller_tribe_id: u32,
    points_awarded: u64,
}
