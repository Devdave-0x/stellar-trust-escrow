#![no_std]

use soroban_sdk::{Address, Env, Vec};

/// Requires that at least `threshold` unique `signers` are members of `admins`,
/// and that each signer has authorized the call.
pub fn require_admin_threshold(
    env: &Env,
    admins: &Vec<Address>,
    threshold: u32,
    signers: &Vec<Address>,
) -> Result<(), ()> {
    if threshold == 0 {
        return Err(());
    }

    // Count unique, authorized admin signers.
    let mut counted: Vec<Address> = Vec::new(env);
    let mut ok: u32 = 0;

    for i in 0..signers.len() {
        let s = signers.get(i).ok_or(())?;
        if counted.contains(&s) {
            continue;
        }
        if !admins.contains(&s) {
            continue;
        }
        s.require_auth();
        counted.push_back(s);
        ok = ok.saturating_add(1);
        if ok >= threshold {
            return Ok(());
        }
    }

    Err(())
}

