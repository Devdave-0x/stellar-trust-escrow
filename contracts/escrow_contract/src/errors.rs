use soroban_sdk::contracterror;

#[contracterror(export = false)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EcErr {
    E1 = 1,
    E2 = 2,
    E3 = 3,
    E4 = 4,
    E5 = 5,
    E7 = 7,
    E8 = 8,
    E9 = 9,
    E10 = 10,
    E11 = 11,
    E12 = 12,
    E13 = 13,
    E14 = 14,
    E15 = 15,
    E16 = 16,
    E17 = 17,
    E19 = 19,
    E20 = 20,
    E22 = 22,
    E23 = 23,
    E24 = 24,
    E26 = 26,
    E28 = 28,
    E30 = 30,
    E31 = 31,
    E32 = 32,
    E33 = 33,
    E34 = 34,
    E35 = 35,
    E36 = 36,
    E37 = 37,
    E38 = 38,
    E39 = 39,
    E40 = 40,
    E41 = 41,
    E42 = 42,
    E43 = 43,
    E44 = 44,
    E45 = 45,
    E46 = 46,
    E47 = 47,
    E51 = 51,
    E53 = 53,
    E54 = 54,
    E55 = 55,
    E56 = 56,
    E57 = 57,
    E58 = 58,
    E59 = 59,
    E60 = 60,
    E61 = 61,
    E62 = 62,
    E63 = 63,
    E64 = 64,
    E65 = 65,
    E66 = 66,
    OracleStaleFeed = 67,
    OracleInvalidPrice = 68,
    OraclePriceConversionFailed = 69,
    /// Timelock release time is in the past or zero — must be a future timestamp.
    TimelockReleasetimeInvalid = 70,
    /// A timelock release time is already set for this escrow.
    TimelockAlreadySet = 71,
    /// Timelock release time has not yet been reached; release is blocked.
    TimelockNotExpired = 72,
    /// No timelock release time is configured on this escrow.
    TimelockNotSet = 73,
    /// Multisig config is internally inconsistent: `weights` length does not match
    /// `approvers`, a weight is zero, or `threshold` is zero or exceeds the total weight.
    MultisigInvalidConfig = 74,
    /// The caller is not among this escrow's multisig approvers.
    MultisigNotApprover = 75,
    /// This signer has already recorded an approval for this milestone.
    MultisigDuplicateApproval = 76,
    /// The approver list exceeds `MAX_BUYER_SIGNERS`.
    MultisigTooManySigners = 77,
    /// The escrow amount is at or above the high-value threshold, which requires a
    /// multisig policy needing more than one signer.
    MultisigRequiredForHighValue = 78,
}

/// Backward-compatible alias — existing code imports `EscrowError`; the oracle
/// refactor renamed the enum to `EcErr` without updating call sites.
pub type EscrowError = EcErr;
