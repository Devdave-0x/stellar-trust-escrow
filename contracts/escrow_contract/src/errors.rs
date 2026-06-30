use soroban_sdk::contracterror;

/// Typed error enum covering every failure mode in the escrow contract.
///
/// Every variant has a stable `u32` discriminant included in the contract ABI.
/// Callers can match on the numeric code or on the variant name — both are
/// stable across upgrades.
///
/// # ABI reference
///
/// | Code | Variant | When raised |
/// |------|---------|-------------|
/// | 1  | `AlreadyInitialized`              | `initialize` called on an already-initialized contract |
/// | 2  | `NotInitialized`                  | Entry point called before `initialize` |
/// | 3  | `Unauthorized`                    | Caller is not an authorized participant (client, freelancer, arbiter, or NFT holder) |
/// | 4  | `NotAdmin`                        | Caller is not the contract admin |
/// | 5  | `NotClient`                       | Caller is not the escrow client |
/// | 7  | `Reserved7`                       | Reserved for future use |
/// | 8  | `EscrowNotFound`                  | No escrow meta exists for the given ID (never created or already expired) |
/// | 9  | `EscrowNotActive`                 | Operation requires `Active` escrow status |
/// | 10 | `EscrowNotInDisputedState`        | Operation requires `Disputed` escrow status |
/// | 11 | `Reserved11`                      | Reserved for future use |
/// | 12 | `Reserved12`                      | Reserved for future use |
/// | 13 | `MilestoneNotFound`               | No milestone record exists for the given ID |
/// | 14 | `MilestoneNotApproved`            | Milestone is not in `Approved` state, or price condition is not yet met |
/// | 15 | `AllocationExceedsTotal`          | Adding the milestone amount would exceed the escrow's total funded amount |
/// | 16 | `MilestoneLimitExceeded`          | Maximum milestone count for this escrow has been reached |
/// | 17 | `InvalidAmount`                   | Amount is zero, negative, or otherwise invalid |
/// | 19 | `InvalidInput`                    | Input value is out of the valid range (string too long, amount out of bounds, etc.) |
/// | 20 | `ArithmeticOverflow`              | Checked arithmetic overflowed |
/// | 22 | `ReentrancyDetected`              | Reentrancy guard is active — contract is already executing |
/// | 23 | `DisputeTimeoutNotExpired`        | Dispute timeout has not elapsed, or is not configured for this escrow |
/// | 24 | `Reserved24`                      | Reserved for future use |
/// | 26 | `MetaTxDeadlineExpired`           | Meta-transaction deadline has passed |
/// | 28 | `LockTimeNotExpired`              | Escrow lock time has not yet elapsed |
/// | 30 | `InvalidMultisigConfig`           | Multisig threshold is zero or exceeds the signer count |
/// | 31 | `ContractPaused`                  | Contract is currently paused by the admin |
/// | 32 | `CancellationRequestNotFound`     | No pending cancellation request exists for this escrow |
/// | 33 | `CancellationAlreadyExists`       | A cancellation request already exists for this escrow |
/// | 34 | `CancellationAlreadyDisputed`     | Cancellation request has already been disputed |
/// | 35 | `CancellationDisputePeriodActive` | Cancellation dispute window has not yet closed |
/// | 36 | `CancellationDisputePeriodExpired`| Cancellation dispute window has already closed |
/// | 37 | `CancellationIsDisputed`          | Cannot execute cancellation while a dispute is pending |
/// | 38 | `SlashRecordNotFound`             | No slash record exists for this escrow |
/// | 39 | `SlashRecordIsDisputed`           | Slash record is currently being disputed |
/// | 40 | `SlashDisputePeriodActive`        | Slash dispute period has not yet expired |
/// | 41 | `InternalStorageCorruption`       | Internal storage invariant violated (should never be reached) |
/// | 42 | `StorageDowngradeNotAllowed`      | Cannot migrate storage to an older schema version |
/// | 43 | `DisputeRecordNotFound`           | No dispute record exists for this escrow |
/// | 44 | `RecurringStartTimePast`          | Recurring schedule start time must be in the future |
/// | 45 | `RecurringPaymentNotDue`          | No recurring payments are due at this time |
/// | 46 | `RecurringSchedulePaused`         | Recurring payment schedule is currently paused |
/// | 47 | `RecurringScheduleCancelled`      | Recurring payment schedule has been cancelled |
/// | 51 | `TimelockArithmeticOverflow`      | Overflow while computing the timelock expiry ledger |
/// | 53 | `TimelockNotExpired`              | Release timelock has not yet expired |
/// | 54 | `BridgeTokenNotApproved`          | Bridged token is not registered or not yet finalized |
/// | 55 | `TitleTooLong`                    | Milestone title exceeds the maximum allowed length |
/// | 56 | `DisputeGracePeriodActive`        | Dispute grace period has not yet elapsed |
/// | 57 | `OraclePubkeyMismatch`            | Oracle payload public key does not match the trusted key |
/// | 58 | `OraclePayloadExpired`            | Oracle-signed payload has passed its `expires_at` timestamp |
/// | 59 | `DisputePayoutBpsInvalid`         | Client and freelancer basis points do not sum to 10 000 |
/// | 60 | `DisputeStartNotRecorded`         | Dispute start ledger is not recorded in the escrow state |
/// | 61 | `EscrowFrozen`                    | Escrow is frozen and cannot be modified |
/// | 62 | `AdminThresholdNotMet`            | Required admin multisig threshold was not met |
/// | 63 | `InvalidAdminMultisigConfig`      | Admin threshold is zero or exceeds the configured signer count |
/// | 64 | `InvalidTimelockDuration`         | Timelock duration is zero or exceeds the maximum |
/// | 65 | `PendingReleaseNotFound`          | No pending release record exists for this milestone |
/// | 66 | `ReleaseTimelockNotExpired`       | Pending release timelock has not yet expired |
/// | 67 | `OracleStaleFeed`                 | Oracle price feed is older than the configured staleness threshold |
/// | 68 | `OracleInvalidPrice`              | Oracle returned a non-positive price |
/// | 69 | `OraclePriceConversionFailed`     | Oracle price conversion failed, or percentage milestone value is invalid |
/// | 70 | `TooManyPctMilestones`            | Maximum number of percentage-based milestones reached |
/// | 71 | `ExtensionRequestNotFound`        | No deadline extension request exists for this escrow |
/// | 72 | `InvalidDisputeSplitPercentages`  | Buyer and seller dispute split percentages do not sum to 100 |
/// | 73 | `DisputeCooldownActive`           | Dispute arbiter cooldown period has not elapsed |
/// | 74 | `SelfEscrowNotAllowed`            | Client and freelancer cannot be the same address |
/// | 75 | `EscrowNotDisputed`               | Escrow is not currently in a disputed state (no dispute record) |
/// | 76 | `LegacyUninitialized`             | Legacy — superseded by `NotInitialized` (code 2) |
/// | 77 | `TreasuryNotConfigured`           | Platform treasury address has not been configured |
/// | 78 | `DexSwapFailed`                   | DEX swap during release failed; original asset was transferred instead |
/// | 79 | `DexRouterNotConfigured`          | DEX router contract address has not been set by the admin |
#[contracterror(export = false)]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    /// `initialize` called on an already-initialized contract.
    AlreadyInitialized = 1,
    /// Entry point called before `initialize`.
    NotInitialized = 2,
    /// Caller is not an authorized participant.
    Unauthorized = 3,
    /// Caller is not the contract admin.
    NotAdmin = 4,
    /// Caller is not the escrow client.
    NotClient = 5,
    /// Reserved for future use.
    Reserved7 = 7,
    /// No escrow meta exists for the given ID.
    EscrowNotFound = 8,
    /// Operation requires `Active` escrow status.
    EscrowNotActive = 9,
    /// Operation requires `Disputed` escrow status.
    EscrowNotInDisputedState = 10,
    /// Reserved for future use.
    Reserved11 = 11,
    /// Reserved for future use.
    Reserved12 = 12,
    /// No milestone record exists for the given ID.
    MilestoneNotFound = 13,
    /// Milestone is not in `Approved` state, or price condition is not yet met.
    MilestoneNotApproved = 14,
    /// Adding the milestone amount would exceed the escrow's total funded amount.
    AllocationExceedsTotal = 15,
    /// Maximum milestone count for this escrow has been reached.
    MilestoneLimitExceeded = 16,
    /// Amount is zero, negative, or otherwise invalid.
    InvalidAmount = 17,
    /// Input value is out of the valid range.
    InvalidInput = 19,
    /// Checked arithmetic overflowed.
    ArithmeticOverflow = 20,
    /// Reentrancy guard is active — contract is already executing.
    ReentrancyDetected = 22,
    /// Dispute timeout has not elapsed, or is not configured.
    DisputeTimeoutNotExpired = 23,
    /// Reserved for future use.
    Reserved24 = 24,
    /// Meta-transaction deadline has passed.
    MetaTxDeadlineExpired = 26,
    /// Escrow lock time has not yet elapsed.
    LockTimeNotExpired = 28,
    /// Multisig threshold is zero or exceeds the signer count.
    InvalidMultisigConfig = 30,
    /// Contract is currently paused by the admin.
    ContractPaused = 31,
    /// No pending cancellation request exists for this escrow.
    CancellationRequestNotFound = 32,
    /// A cancellation request already exists for this escrow.
    CancellationAlreadyExists = 33,
    /// Cancellation request has already been disputed.
    CancellationAlreadyDisputed = 34,
    /// Cancellation dispute window has not yet closed.
    CancellationDisputePeriodActive = 35,
    /// Cancellation dispute window has already closed.
    CancellationDisputePeriodExpired = 36,
    /// Cannot execute cancellation while a dispute is pending.
    CancellationIsDisputed = 37,
    /// No slash record exists for this escrow.
    SlashRecordNotFound = 38,
    /// Slash record is currently being disputed.
    SlashRecordIsDisputed = 39,
    /// Slash dispute period has not yet expired.
    SlashDisputePeriodActive = 40,
    /// Internal storage invariant violated (should never be reached in production).
    InternalStorageCorruption = 41,
    /// Cannot migrate storage to an older schema version.
    StorageDowngradeNotAllowed = 42,
    /// No dispute record exists for this escrow.
    DisputeRecordNotFound = 43,
    /// Recurring schedule start time must be in the future.
    RecurringStartTimePast = 44,
    /// No recurring payments are due at this time.
    RecurringPaymentNotDue = 45,
    /// Recurring payment schedule is currently paused.
    RecurringSchedulePaused = 46,
    /// Recurring payment schedule has been cancelled.
    RecurringScheduleCancelled = 47,
    /// Overflow while computing the timelock expiry ledger.
    TimelockArithmeticOverflow = 51,
    /// Release timelock has not yet expired.
    TimelockNotExpired = 53,
    /// Bridged token is not registered or not yet finalized.
    BridgeTokenNotApproved = 54,
    /// Milestone title exceeds the maximum allowed length.
    TitleTooLong = 55,
    /// Dispute grace period has not yet elapsed.
    DisputeGracePeriodActive = 56,
    /// Oracle payload public key does not match the trusted key.
    OraclePubkeyMismatch = 57,
    /// Oracle-signed payload has passed its `expires_at` timestamp.
    OraclePayloadExpired = 58,
    /// Client and freelancer basis points do not sum to 10 000.
    DisputePayoutBpsInvalid = 59,
    /// Dispute start ledger is not recorded in the escrow state.
    DisputeStartNotRecorded = 60,
    /// Escrow is frozen and cannot be modified.
    EscrowFrozen = 61,
    /// Required admin multisig threshold was not met.
    AdminThresholdNotMet = 62,
    /// Admin threshold is zero or exceeds the configured signer count.
    InvalidAdminMultisigConfig = 63,
    /// Timelock duration is zero or exceeds the maximum.
    InvalidTimelockDuration = 64,
    /// No pending release record exists for this milestone.
    PendingReleaseNotFound = 65,
    /// Pending release timelock has not yet expired.
    ReleaseTimelockNotExpired = 66,
    /// Oracle price feed is older than the configured staleness threshold.
    OracleStaleFeed = 67,
    /// Oracle returned a non-positive price.
    OracleInvalidPrice = 68,
    /// Oracle price conversion failed, or percentage milestone value is invalid.
    OraclePriceConversionFailed = 69,
    /// Maximum number of percentage-based milestones reached.
    TooManyPctMilestones = 70,
    /// No deadline extension request exists for this escrow.
    ExtensionRequestNotFound = 71,
    /// Buyer and seller dispute split percentages do not sum to 100.
    InvalidDisputeSplitPercentages = 72,
    /// Dispute arbiter cooldown period has not elapsed.
    DisputeCooldownActive = 73,
    /// Client and freelancer cannot be the same address.
    SelfEscrowNotAllowed = 74,
    /// Escrow is not currently in a disputed state (no dispute record).
    EscrowNotDisputed = 75,
    /// Legacy alias — superseded by `NotInitialized` (code 2).
    LegacyUninitialized = 76,
    /// Platform treasury address has not been configured.
    TreasuryNotConfigured = 77,
    /// DEX swap during release failed; original asset was transferred instead.
    DexSwapFailed = 78,
    /// DEX router contract address has not been set by the admin.
    DexRouterNotConfigured = 79,
}

/// Backward-compatible alias — all entry points and tests import `EscrowError`.
pub type EscrowError = ContractError;
