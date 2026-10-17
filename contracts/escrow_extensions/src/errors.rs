use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ExtError {
    // ── Init ──────────────────────────────────────────────────────────────────
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AdminOnly = 3,
    Unauthorized = 4,

    // ── Batch creation ────────────────────────────────────────────────────────
    BatchTooLarge = 10,
    BatchEmpty = 11,
    BatchItemInvalid = 12,

    // ── Protocol fees ─────────────────────────────────────────────────────────
    InvalidFeeBps = 20,
    /// fee_bps > 200 (2 %)
    FeeTooHigh = 21,
    InvalidRecipient = 22,
    NoFeesAccumulated = 23,

    // ── Dispute arbitration ───────────────────────────────────────────────────
    DisputeNotFound = 30,
    DisputeAlreadyExists = 31,
    VotingWindowClosed = 32,
    VotingWindowOpen = 33,
    AlreadyVoted = 34,
    InsufficientStake = 35,
    InvalidVoteWeight = 36,
    QuorumNotReached = 37,

    // ── Proxy / upgrade ───────────────────────────────────────────────────────
    UpgradeDelayNotElapsed = 40,
    NoPendingUpgrade = 41,
    UpgradeAlreadyPending = 42,
    InvalidWasmHash = 43,

    // ── Arithmetic ────────────────────────────────────────────────────────────
    /// A checked arithmetic operation (add/mul) overflowed.
    ArithmeticOverflow = 44,

    // ── Arbiter decision finality ─────────────────────────────────────────────
    /// Caller is not the registered arbiter for this escrow.
    ArbiterOnly = 50,
    /// The arbiter decision for this escrow has already been finalized.
    DecisionAlreadyFinalized = 51,
    /// The supplied decision value is not a recognized/supported outcome.
    InvalidDecision = 52,
    /// No escrow exists for the supplied identifier.
    EscrowNotFound = 53,
    /// The escrow is not in a state that permits an arbiter decision.
    DecisionNotAllowed = 54,
    /// The arbiter decision payload is malformed or missing required fields.
    InvalidDecisionPayload = 55,
}