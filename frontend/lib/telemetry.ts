/**
 * Privacy-safe interaction telemetry.
 *
 * Emits deterministic, structured events for wallet session network changes
 * without ever recording wallet addresses, signatures, or sensitive payloads.
 * Only coarse, non-identifying metadata (chain ids, outcome categories) is
 * captured so outcomes can be measured safely.
 */

export type WalletNetworkChangeOutcome =
  | "applied"
  | "noop_same_network"
  | "unsupported_chain"
  | "switch_rejected"
  | "switch_failed";

export interface WalletNetworkChangeEvent {
  event: "wallet_network_change";
  outcome: WalletNetworkChangeOutcome;
  fromChainId: number | null;
  toChainId: number | null;
  /** Deterministic, non-sensitive error category (never a raw message). */
  errorCategory?: string;
}

export type TelemetrySink = (event: WalletNetworkChangeEvent) => void;

const defaultSink: TelemetrySink = (event) => {
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[telemetry]", JSON.stringify(event));
  }
};

let sink: TelemetrySink = defaultSink;

/** Replace the telemetry sink (e.g. in tests). Returns a restore function. */
export function setTelemetrySink(next: TelemetrySink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

function normalizeChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Map an arbitrary error into a small, deterministic category.
 * Never returns raw error messages, which may contain sensitive data.
 */
export function categorizeNetworkError(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === 4001 || code === "ACTION_REJECTED") {
      return "user_rejected";
    }
    if (code === 4902 || code === "UNRECOGNIZED_CHAIN") {
      return "unrecognized_chain";
    }
    if (typeof code === "number" || typeof code === "string") {
      return "provider_error";
    }
  }
  return "unknown_error";
}

/**
 * Record a wallet session network change outcome.
 *
 * The emitted event is deterministic and contains no wallet address,
 * signature, or raw payload data.
 */
export function trackWalletNetworkChange(input: {
  outcome: WalletNetworkChangeOutcome;
  fromChainId?: unknown;
  toChainId?: unknown;
  error?: unknown;
}): WalletNetworkChangeEvent {
  const event: WalletNetworkChangeEvent = {
    event: "wallet_network_change",
    outcome: input.outcome,
    fromChainId: normalizeChainId(input.fromChainId),
    toChainId: normalizeChainId(input.toChainId),
  };

  if (input.outcome === "switch_rejected" || input.outcome === "switch_failed") {
    event.errorCategory = categorizeNetworkError(input.error);
  }

  try {
    sink(event);
  } catch {
    // Telemetry must never break the wallet flow.
  }

  return event;
}
