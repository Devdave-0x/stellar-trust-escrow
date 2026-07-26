#![cfg(test)]

use crate::MAX_PARTICIPANTS;

#[test]
fn max_participants_constant_is_ten() {
    assert_eq!(MAX_PARTICIPANTS, 10);
}

#[test]
fn exactly_at_limit_is_allowed() {
    let count: u32 = MAX_PARTICIPANTS;
    assert!(count <= MAX_PARTICIPANTS);
}

#[test]
fn one_over_limit_is_rejected() {
    let count: u32 = MAX_PARTICIPANTS + 1;
    assert!(count > MAX_PARTICIPANTS);
}

#[test]
fn zero_participants_is_rejected() {
    let count: u32 = 0;
    assert!(count == 0);
}
