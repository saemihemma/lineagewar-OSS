/// War registry: core war state, tribe registration, and resolution.
///
/// Manages WarRegistry (shared), WarAdminCap (owned), TribeKey (dynamic field),
/// and WarResolution (shared). Admin-operated via WarAdminCap authorization.
module lineage_war::registry;

use std::option::{Self, Option};
use std::string::String;
use sui::clock::Clock;
use sui::dynamic_field;
use sui::event;
use lineage_war::rules;

#[error(code = 0)]
const EInvalidWarId: vector<u8> = b"War id must be non-zero";
#[error(code = 1)]
const EInvalidSourceOfTruthMode: vector<u8> = b"Invalid source of truth mode";
#[error(code = 2)]
const EAdminCapMismatch: vector<u8> = b"Admin cap does not match war";
#[error(code = 3)]
const EWarAlreadyResolved: vector<u8> = b"War is already resolved";
#[error(code = 4)]
const EWarNotEnded: vector<u8> = b"War has not ended yet";
#[error(code = 5)]
const ENoEndScheduled: vector<u8> = b"No war end is scheduled";
#[error(code = 6)]
const EMismatchedScoreArrays: vector<u8> = b"Tribe ID and score arrays must have the same length";
#[error(code = 7)]
const ETribeLimitExceeded: vector<u8> = b"Maximum number of tribes already registered";
#[error(code = 8)]
const ETribeAlreadyRegistered: vector<u8> = b"Tribe is already registered in this war";

// --- Events ---

public struct WarCreatedEvent has copy, drop {
    war_id: u64,
    source_of_truth_mode: u8,
    win_margin: u64,
}

public struct WarPausedEvent has copy, drop {
    war_id: u64,
}

public struct WarResumedEvent has copy, drop {
    war_id: u64,
}

public struct WarEndedEvent has copy, drop {
    war_id: u64,
    ended_at_ms: u64,
}

public struct WarEndTimeUpdatedEvent has copy, drop {
    war_id: u64,
    new_ended_at_ms: u64,
}

public struct WarEndCancelledEvent has copy, drop {
    war_id: u64,
}

public struct WarResolvedEvent has copy, drop {
    war_id: u64,
    resolution_id: ID,
}

public struct WinMarginUpdatedEvent has copy, drop {
    war_id: u64,
    old_margin: u64,
    new_margin: u64,
}

// --- Objects ---

public struct WarRegistry has key {
    id: UID,
    war_id: u64,
    slug: String,
    display_name: String,
    enabled: bool,
    max_supported_tribes: u16,
    source_of_truth_mode: u8,
    created_at_ms: u64,
    current_war_config_version: u64,
    ended_at_ms: Option<u64>,
    tribe_count: u16,
    win_margin: u64,
    resolved: bool,
}

public struct WarAdminCap has key, store {
    id: UID,
    war_id: u64,
}

public struct TribeInfo has store, drop {
    tribe_id: u32,
    display_name: String,
}

public struct TribeKey has copy, drop, store {
    tribe_id: u32,
}

public struct TribeRegisteredEvent has copy, drop {
    war_id: u64,
    tribe_id: u32,
    display_name: String,
}

public struct TribeScore has store, drop {
    tribe_id: u32,
    score: u64,
}

public struct WinMarginRecord has key {
    id: UID,
    war_id: u64,
    win_margin: u64,
    set_at_ms: u64,
}

public struct WarResolution has key {
    id: UID,
    war_id: u64,
    tribe_scores: vector<TribeScore>,
    winner_tribe_id: Option<u32>,
    is_draw: bool,
    win_margin: u64,
    resolved_at_ms: u64,
}

// --- Create ---

/// Creates a new war registry and admin capability.
/// Returns both the registry (ready to be shared) and the admin cap (retained by creator).
public fun create_war(
    war_id: u64,
    slug: String,
    display_name: String,
    max_supported_tribes: u16,
    source_of_truth_mode: u8,
    win_margin: u64,
    created_at_ms: u64,
    ctx: &mut TxContext,
): (WarRegistry, WarAdminCap) {
    assert!(war_id != 0, EInvalidWarId);
    assert!(rules::is_valid_source_of_truth_mode(source_of_truth_mode), EInvalidSourceOfTruthMode);

    let registry = WarRegistry {
        id: object::new(ctx),
        war_id,
        slug,
        display_name,
        enabled: true,
        max_supported_tribes,
        source_of_truth_mode,
        created_at_ms,
        current_war_config_version: 0,
        ended_at_ms: option::none(),
        tribe_count: 0,
        win_margin,
        resolved: false,
    };
    let admin_cap = WarAdminCap {
        id: object::new(ctx),
        war_id,
    };

    event::emit(WarCreatedEvent {
        war_id,
        source_of_truth_mode,
        win_margin,
    });

    (registry, admin_cap)
}

/// Shares the war registry as a shared object for public access.
public fun share_war_registry(registry: WarRegistry) {
    transfer::share_object(registry);
}

/// Registers a tribe as a participant in this war.
/// Creates a TribeKey dynamic field on the registry. Aborts if tribe already registered or limit exceeded.
public fun register_tribe(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    tribe_id: u32,
    display_name: String,
) {
    assert_admin(admin_cap, registry.war_id);
    assert!(!registry.resolved, EWarAlreadyResolved);
    assert!(registry.tribe_count < registry.max_supported_tribes, ETribeLimitExceeded);
    assert!(!dynamic_field::exists_(&registry.id, TribeKey { tribe_id }), ETribeAlreadyRegistered);

    dynamic_field::add(
        &mut registry.id,
        TribeKey { tribe_id },
        TribeInfo { tribe_id, display_name: display_name.clone() },
    );
    registry.tribe_count = registry.tribe_count + 1;

    event::emit(TribeRegisteredEvent {
        war_id: registry.war_id,
        tribe_id,
        display_name,
    });
}

// --- Pause / Resume ---

/// Pauses the war, disabling all active gameplay.
public fun pause_war(registry: &mut WarRegistry, admin_cap: &WarAdminCap) {
    assert_admin(admin_cap, registry.war_id);
    registry.enabled = false;
    event::emit(WarPausedEvent { war_id: registry.war_id });
}

/// Resumes the war after being paused.
public fun resume_war(registry: &mut WarRegistry, admin_cap: &WarAdminCap) {
    assert_admin(admin_cap, registry.war_id);
    registry.enabled = true;
    event::emit(WarResumedEvent { war_id: registry.war_id });
}

// --- End / Update End / Cancel End ---

/// Schedules the war to end at the specified timestamp.
public fun end_war(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    ended_at_ms: u64,
) {
    assert_admin(admin_cap, registry.war_id);
    assert!(!registry.resolved, EWarAlreadyResolved);
    registry.ended_at_ms = option::some(ended_at_ms);
    event::emit(WarEndedEvent { war_id: registry.war_id, ended_at_ms });
}

/// Updates the scheduled war end time.
public fun update_war_end_time(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    new_ended_at_ms: u64,
) {
    assert_admin(admin_cap, registry.war_id);
    assert!(!registry.resolved, EWarAlreadyResolved);
    assert!(option::is_some(&registry.ended_at_ms), ENoEndScheduled);
    registry.ended_at_ms = option::some(new_ended_at_ms);
    event::emit(WarEndTimeUpdatedEvent { war_id: registry.war_id, new_ended_at_ms });
}

/// Cancels the scheduled war end time.
public fun cancel_war_end(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
) {
    assert_admin(admin_cap, registry.war_id);
    assert!(!registry.resolved, EWarAlreadyResolved);
    assert!(option::is_some(&registry.ended_at_ms), ENoEndScheduled);
    registry.ended_at_ms = option::none();
    event::emit(WarEndCancelledEvent { war_id: registry.war_id });
}

// --- Resolution ---

/// Resolves the war by computing final scores and determining the winner.
/// Creates and shares a WarResolution object with the result.
public fun resolve_war(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    tribe_ids: vector<u32>,
    scores: vector<u64>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_admin(admin_cap, registry.war_id);
    assert!(!registry.resolved, EWarAlreadyResolved);
    assert!(tribe_ids.length() == scores.length(), EMismatchedScoreArrays);

    let mut tribe_scores = vector::empty<TribeScore>();
    let mut winner_id: Option<u32> = option::none();
    let mut best_score: u64 = 0;
    let mut second_score: u64 = 0;

    let mut i = 0;
    while (i < tribe_ids.length()) {
        let tid = *vector::borrow(&tribe_ids, i);
        let sc = *vector::borrow(&scores, i);
        vector::push_back(&mut tribe_scores, TribeScore { tribe_id: tid, score: sc });
        if (sc > best_score) {
            second_score = best_score;
            best_score = sc;
            winner_id = option::some(tid);
        } else if (sc > second_score) {
            second_score = sc;
        };
        i = i + 1;
    };

    let margin = if (best_score > second_score) { best_score - second_score } else { 0 };
    let is_draw = margin < registry.win_margin;
    if (is_draw) {
        winner_id = option::none();
    };

    let resolved_at_ms = clock.timestamp_ms();

    let resolution = WarResolution {
        id: object::new(ctx),
        war_id: registry.war_id,
        tribe_scores,
        winner_tribe_id: winner_id,
        is_draw,
        win_margin: registry.win_margin,
        resolved_at_ms,
    };

    registry.resolved = true;

    event::emit(WarResolvedEvent {
        war_id: registry.war_id,
        resolution_id: object::id(&resolution),
    });

    transfer::share_object(resolution);
}

// --- Win Margin ---

/// Updates the win margin and records the change in a shared object.
public fun set_win_margin(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    new_margin: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_admin(admin_cap, registry.war_id);
    let old_margin = registry.win_margin;
    registry.win_margin = new_margin;

    let record = WinMarginRecord {
        id: object::new(ctx),
        war_id: registry.war_id,
        win_margin: new_margin,
        set_at_ms: clock.timestamp_ms(),
    };
    transfer::share_object(record);

    event::emit(WinMarginUpdatedEvent {
        war_id: registry.war_id,
        old_margin,
        new_margin,
    });
}

// --- Config version ---

/// Bumps the war config version to track config changes.
public fun bump_war_config_version(
    registry: &mut WarRegistry,
    admin_cap: &WarAdminCap,
    version: u64,
) {
    assert_admin(admin_cap, registry.war_id);
    registry.current_war_config_version = version;
}

// --- Getters ---

/// Returns the war ID.
public fun war_id(registry: &WarRegistry): u64 {
    registry.war_id
}

/// Returns the source of truth mode.
public fun source_of_truth_mode(registry: &WarRegistry): u8 {
    registry.source_of_truth_mode
}

/// Returns whether the war is currently enabled.
public fun is_enabled(registry: &WarRegistry): bool {
    registry.enabled
}

/// Extracts the war ID from an admin cap.
public fun war_id_from_admin_cap(admin_cap: &WarAdminCap): u64 {
    admin_cap.war_id
}

fun assert_admin(admin_cap: &WarAdminCap, war_id: u64) {
    assert!(admin_cap.war_id == war_id, EAdminCapMismatch);
}
