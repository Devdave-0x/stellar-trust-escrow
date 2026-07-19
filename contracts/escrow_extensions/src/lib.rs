#![no_std]

mod errors;
mod events;
mod types;

use soroban_sdk::{contract, contractimpl, Address, Env, Symbol};
use types::*;

pub fn create_vesting(
    env: Env,
    caller: Address,
    escrow_id: u64,
    cliff_seconds: u64,
    duration_seconds: u64,
    total_amount: i128,
) {
    caller.require_auth();
    let schedule = VestingSchedule { escrow_id, cliff_seconds, duration_seconds, total_amount, claimed_amount: 0, start_ledger: env.ledger().timestamp() };
    env.storage().persistent().set(&DataKey::VestingSchedule(escrow_id), &schedule);
    events::emit_vesting_created(&env, escrow_id, total_amount);
}

pub fn claim_vested(env: Env, beneficiary: Address, escrow_id: u64) -> i128 {
    beneficiary.require_auth();
    let schedule: VestingSchedule = env.storage().persistent().get(&DataKey::VestingSchedule(escrow_id)).unwrap_or_else(|| panic!("vesting schedule not found"));
    let now = env.ledger().timestamp();
    let elapsed = now.saturating_sub(schedule.start_ledger);
    if elapsed < schedule.cliff_seconds { return 0; }
    let vested = if elapsed >= schedule.duration_seconds { schedule.total_amount } else { (schedule.total_amount as u128 * elapsed as u128 / schedule.duration_seconds as u128) as i128 };
    let claimable = vested - schedule.claimed_amount;
    if claimable <= 0 { return 0; }
    let mut updated = schedule;
    updated.claimed_amount += claimable;
    env.storage().persistent().set(&DataKey::VestingSchedule(escrow_id), &updated);
    events::emit_vested_claimed(&env, escrow_id, beneficiary, claimable);
    claimable
}

pub fn create_recurring(
    env: Env,
    caller: Address,
    escrow_id: u64,
    payment_amount: i128,
    interval_seconds: u64,
    total_payments: u32,
) {
    caller.require_auth();
    let schedule = RecurringSchedule { escrow_id, payment_amount, interval_seconds, total_payments, payments_processed: 0, paused: false, start_ledger: env.ledger().timestamp(), last_payment_ledger: 0 };
    env.storage().persistent().set(&DataKey::RecurringSchedule(escrow_id), &schedule);
    events::emit_recurring_created(&env, escrow_id, payment_amount, total_payments);
}

pub fn process_due_payments(env: Env, escrow_id: u64) -> u32 {
    let mut schedule: RecurringSchedule = env.storage().persistent().get(&DataKey::RecurringSchedule(escrow_id)).unwrap_or_else(|| panic!("recurring schedule not found"));
    if schedule.paused || schedule.payments_processed >= schedule.total_payments { return 0; }
    let now = env.ledger().timestamp();
    let intervals = (now - schedule.start_ledger) / schedule.interval_seconds;
    let due = intervals.min(schedule.total_payments as u64) - schedule.payments_processed as u64;
    if due == 0 { return 0; }
    let mut processed = 0u32;
    for _ in 0..due {
        if schedule.payments_processed >= schedule.total_payments { break; }
        schedule.payments_processed += 1;
        processed += 1;
    }
    schedule.last_payment_ledger = now;
    env.storage().persistent().set(&DataKey::RecurringSchedule(escrow_id), &schedule);
    processed
}

pub fn pause_recurring(env: Env, caller: Address, escrow_id: u64) {
    caller.require_auth();
    let mut schedule: RecurringSchedule = env.storage().persistent().get(&DataKey::RecurringSchedule(escrow_id)).unwrap_or_else(|| panic!("recurring schedule not found"));
    schedule.paused = true;
    env.storage().persistent().set(&DataKey::RecurringSchedule(escrow_id), &schedule);
}

pub fn resume_recurring(env: Env, caller: Address, escrow_id: u64) {
    caller.require_auth();
    let mut schedule: RecurringSchedule = env.storage().persistent().get(&DataKey::RecurringSchedule(escrow_id)).unwrap_or_else(|| panic!("recurring schedule not found"));
    schedule.paused = false;
    env.storage().persistent().set(&DataKey::RecurringSchedule(escrow_id), &schedule);
}

pub fn cancel_recurring(env: Env, caller: Address, escrow_id: u64) -> i128 {
    caller.require_auth();
    let schedule: RecurringSchedule = env.storage().persistent().get(&DataKey::RecurringSchedule(escrow_id)).unwrap_or_else(|| panic!("recurring schedule not found"));
    let remaining = (schedule.total_payments - schedule.payments_processed) as i128 * schedule.payment_amount;
    env.storage().persistent().remove(&DataKey::RecurringSchedule(escrow_id));
    remaining
}

pub fn delegate_role(env: Env, delegator: Address, escrow_id: u64, role: DelegatedRole, delegate: Address, expires_at_ledger: u64) {
    delegator.require_auth();
    let delegation = RoleDelegation { delegator, delegate: delegate.clone(), role, escrow_id, expires_at_ledger };
    env.storage().persistent().set(&DataKey::Delegation(escrow_id, role.clone()), &delegation);
    events::emit_role_delegated(&env, escrow_id, role, delegate);
}

pub fn revoke_delegation(env: Env, delegator: Address, escrow_id: u64, role: DelegatedRole) {
    delegator.require_auth();
    env.storage().persistent().remove(&DataKey::Delegation(escrow_id, role));
}

pub fn is_authorized(env: Env, escrow_id: u64, caller: Address, role: DelegatedRole) -> bool {
    if let Some(delegation) = env.storage().persistent().get::<DataKey, RoleDelegation>(&DataKey::Delegation(escrow_id, role)) {
        if delegation.delegate == caller && env.ledger().sequence() <= delegation.expires_at_ledger { return true; }
    }
    false
}
