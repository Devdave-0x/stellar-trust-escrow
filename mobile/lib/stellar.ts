/**
 * Stellar utilities for the mobile app.
 *
 * On mobile, transaction signing is handled differently from the web:
 * - No Freighter extension available
 * - Users sign via WalletConnect or a deep-link to a mobile wallet
 * - For now we support manual XDR signing flow (paste signed XDR)
 *   and WalletConnect v2 as the primary path.
 */

const NETWORK = process.env.EXPO_PUBLIC_STELLAR_NETWORK ?? 'testnet';

export const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

export const HORIZON_URL =
  NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

/**
 * Truncates a Stellar address for display.
 * e.g. GABCD…XYZ1
 */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (!address || address.length < head + tail) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Validates a Stellar public key format (G + 55 base32 chars).
 */
export function isValidStellarAddress(address: string): boolean {
  return typeof address === 'string' && /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Formats a stroops value (BigInt string) to a human-readable XLM amount.
 * 1 XLM = 10_000_000 stroops
 */
export function stroopsToXlm(stroops: string): string {
  const val = BigInt(stroops);
  const xlm = Number(val) / 10_000_000;
  return xlm.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

/**
 * Returns a Stellar explorer URL for an address or transaction.
 */
export function explorerUrl(type: 'account' | 'tx', value: string): string {
  const base =
    NETWORK === 'mainnet'
      ? 'https://stellar.expert/explorer/public'
      : 'https://stellar.expert/explorer/testnet';
  return type === 'account' ? `${base}/account/${value}` : `${base}/tx/${value}`;
}

export interface TransactionErrorInfo {
  /** Safe, user-facing message. Never contains raw error payloads. */
  message: string;
  /** Whether the user can safely retry the operation. */
  retryable: boolean;
  /** Stable machine-readable code for the classified error. */
  code: string;
}

export interface RetryAction {
  label: string;
  retryable: boolean;
  onRetry?: () => void;
}

const TRANSIENT_CODES = new Set([
  'timeout',
  'timed_out',
  'network_error',
  'network',
  'econnreset',
  'econnrefused',
  'etimedout',
  'enotfound',
  'rate_limited',
  'rate_limit',
  'too_many_requests',
  'server_error',
  'internal_error',
  'service_unavailable',
  'tx_too_late',
  'tx_insufficient_fee',
  'try_again_later',
]);

const PERMANENT_CODES = new Set([
  'invalid_address',
  'invalid_xdr',
  'invalid_amount',
  'invalid_asset',
  'insufficient_balance',
  'op_underfunded',
  'op_no_destination',
  'op_no_trust',
  'op_low_reserve',
  'tx_bad_auth',
  'tx_bad_seq',
  'tx_insufficient_balance',
  'unauthorized',
  'forbidden',
  'validation_error',
]);

const TRANSIENT_MESSAGE_PATTERNS: RegExp[] = [
  /timeout|timed out/i,
  /network|connection|socket|offline/i,
  /rate.?limit|too many requests/i,
  /server error|internal error|service unavailable|5\d\d/i,
  /try again/i,
];

const PERMANENT_MESSAGE_PATTERNS: RegExp[] = [
  /invalid (address|xdr|amount|asset)/i,
  /insufficient (balance|funds)/i,
  /underfunded|no trust|low reserve/i,
  /bad auth|unauthorized|forbidden/i,
  /bad seq|sequence/i,
];

function extractCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = (error as { code?: unknown; errorCode?: unknown }).code ??
    (error as { errorCode?: unknown }).errorCode;
  return typeof candidate === 'string' ? candidate.toLowerCase() : undefined;
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
}

/**
 * Classifies a wallet or network error into a safe, user-facing message.
 *
 * Raw error payloads are never surfaced; only a curated message and a
 * retryable flag are returned so the UI can offer a safe retry action.
 */
export function classifyTransactionError(error: unknown): TransactionErrorInfo {
  const code = extractCode(error);
  const rawMessage = extractMessage(error);

  if (code && PERMANENT_CODES.has(code)) {
    return {
      code,
      retryable: false,
      message: 'This transaction cannot be completed. Please review the details and try again.',
    };
  }

  if (code && TRANSIENT_CODES.has(code)) {
    return {
      code,
      retryable: true,
      message: 'A temporary network issue occurred. Please try again.',
    };
  }

  if (PERMANENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(rawMessage))) {
    return {
      code: code ?? 'validation_error',
      retryable: false,
      message: 'This transaction cannot be completed. Please review the details and try again.',
    };
  }

  if (TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(rawMessage))) {
    return {
      code: code ?? 'network_error',
      retryable: true,
      message: 'A temporary network issue occurred. Please try again.',
    };
  }

  return {
    code: code ?? 'unknown_error',
    retryable: false,
    message: 'Something went wrong while processing the transaction. Please try again later.',
  };
}

/**
 * Builds a retry action for a classified transaction error.
 * Permanent errors return a non-retryable action without a handler so the UI
 * does not offer a misleading retry.
 */
export function buildRetryAction(
  error: unknown,
  onRetry?: () => void,
): RetryAction {
  const info = classifyTransactionError(error);
  if (!info.retryable) {
    return { label: info.message, retryable: false };
  }
  return {
    label: info.message,
    retryable: true,
    onRetry,
  };
}
