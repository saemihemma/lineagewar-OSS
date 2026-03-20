/// War systems: registration, enabling/disabling, and priority management.
///
/// Manages WarSystem (key, store). Admin-operated via WarAdminCap authorization.
/// Systems are shared objects that can be enabled/disabled and assigned priority classes.
module lineage_war::systems;

use std::string::String;
use sui::event;
use lineage_war::registry;

#[error(code = 0)]
const EInvalidWarId: vector<u8> = b"War id must be non-zero";
#[error(code = 1)]
const EInvalidSystemId: vector<u8> = b"System id must be non-zero";
#[error(code = 2)]
const EAdminCapMismatch: vector<u8> = b"Admin cap does not match war";

public struct SystemRegisteredEvent has copy, drop {
    war_id: u64,
    system_id: u64,
}

public struct WarSystem has key, store {
    id: UID,
    war_id: u64,
    system_id: u64,
    display_name: String,
    priority_class: u8,
    enabled: bool,
}

/// Registers a new system with the war, returns a WarSystem object.
public fun register_system(
    war_id: u64,
    system_id: u64,
    display_name: String,
    priority_class: u8,
    enabled: bool,
    admin_cap: &registry::WarAdminCap,
    ctx: &mut TxContext,
): WarSystem {
    assert!(war_id != 0, EInvalidWarId);
    assert!(system_id != 0, EInvalidSystemId);
    assert!(registry::war_id_from_admin_cap(admin_cap) == war_id, EAdminCapMismatch);

    let system = WarSystem {
        id: object::new(ctx),
        war_id,
        system_id,
        display_name,
        priority_class,
        enabled,
    };

    event::emit(SystemRegisteredEvent {
        war_id,
        system_id,
    });

    system
}

/// Shares a system as a shared object.
public fun share_system(system: WarSystem) {
    transfer::share_object(system);
}

/// Enables a system.
public fun enable_system(system: &mut WarSystem, admin_cap: &registry::WarAdminCap) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == system.war_id, EAdminCapMismatch);
    system.enabled = true;
}

/// Disables a system.
public fun disable_system(system: &mut WarSystem, admin_cap: &registry::WarAdminCap) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == system.war_id, EAdminCapMismatch);
    system.enabled = false;
}

/// Sets the priority class for a system.
public fun set_priority_class(
    system: &mut WarSystem,
    admin_cap: &registry::WarAdminCap,
    priority_class: u8,
) {
    assert!(registry::war_id_from_admin_cap(admin_cap) == system.war_id, EAdminCapMismatch);
    system.priority_class = priority_class;
}

/// Returns the system ID.
public fun system_id(system: &WarSystem): u64 {
    system.system_id
}

/// Returns the war ID.
public fun war_id(system: &WarSystem): u64 {
    system.war_id
}

/// Returns whether the system is enabled.
public fun enabled(system: &WarSystem): bool {
    system.enabled
}
