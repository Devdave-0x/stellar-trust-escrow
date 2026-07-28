//! # Module registration guard
//!
//! A test file in `src/` only runs if `lib.rs` declares it with `mod <name>;`.
//! Nothing in the toolchain enforces that: an unregistered file compiles never,
//! runs never, and reports nothing — it simply looks like coverage.
//!
//! Five suites were in that state at once (`arbiter_validation_tests`,
//! `escrow_template_tests`, `multisig_lifecycle_tests`, `split_escrow_tests`,
//! `token_whitelist_tests`), which is how `split_escrow` shipped unable to
//! execute at all while appearing to have tests.
//!
//! This guard fails the suite when a `*_tests.rs` file is not registered, so the
//! gap surfaces on the next `cargo test` rather than after a bug ships.

#[cfg(test)]
#[allow(clippy::module_inception)]
mod module_registration_tests {
    extern crate std;

    use std::format;
    use std::fs;
    use std::string::{String, ToString};
    use std::vec::Vec;

    /// Every `*_tests.rs` file in `src/` must have a matching `mod` declaration
    /// in `lib.rs`, otherwise its tests never compile or run.
    #[test]
    fn every_test_file_is_registered_in_lib_rs() {
        let src_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/src");
        let lib_rs = fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs"))
            .expect("src/lib.rs must be readable");

        let mut unregistered: Vec<String> = Vec::new();

        for entry in fs::read_dir(src_dir).expect("src/ must be readable") {
            let entry = entry.expect("src/ entry must be readable");
            let file_name = entry.file_name().to_string_lossy().to_string();

            let stem = match file_name.strip_suffix(".rs") {
                Some(stem) => stem,
                None => continue,
            };
            if !stem.ends_with("_tests") {
                continue;
            }

            // `mod name;` is the declaration form used throughout lib.rs.
            if !lib_rs.contains(&format!("mod {stem};")) {
                unregistered.push(file_name);
            }
        }

        unregistered.sort();

        assert!(
            unregistered.is_empty(),
            "these test files exist in src/ but are not declared in lib.rs, so their \
             tests never compile or run — add `mod <name>;` to lib.rs for each: {:?}",
            unregistered
        );
    }
}
