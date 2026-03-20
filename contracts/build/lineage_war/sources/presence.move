module lineage_war::presence;

public struct SystemPresenceRegistry has key, store {
    id: UID,
    war_id: u64,
    system_id: u64,
}

public struct PresenceMetadata has store, drop {
    tribe_id: u32,
    presence_score: u64,
    qualifying_assembly_count: u64,
}

public fun create_presence_registry(
    war_id: u64,
    system_id: u64,
    ctx: &mut TxContext,
): SystemPresenceRegistry {
    SystemPresenceRegistry {
        id: object::new(ctx),
        war_id,
        system_id,
    }
}

public fun share_presence_registry(registry: SystemPresenceRegistry) {
    transfer::share_object(registry);
}
