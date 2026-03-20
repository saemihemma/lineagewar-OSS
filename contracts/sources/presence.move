/// Presence registry: tracks tribe assemblies and scoring in each system.
///
/// Manages SystemPresenceRegistry (key, store) and PresenceMetadata (dynamic fields).
/// Records which tribes have assemblies in systems and their qualifying assembly counts.
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

/// Creates a presence registry for a war system.
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

/// Shares a presence registry as a shared object.
public fun share_presence_registry(registry: SystemPresenceRegistry) {
    transfer::share_object(registry);
}
