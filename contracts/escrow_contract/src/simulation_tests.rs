//! # Simulation tests
//!
//! Tests for the escrow lifecycle simulation.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod simulation_tests {
    use crate::simulation::run_lifecycle_simulation;

    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_run_lifecycle_simulation() {
        let env = Env::default();
        let escrow_id = run_lifecycle_simulation(&env);
        assert!(escrow_id.is_ok());
    }
}
