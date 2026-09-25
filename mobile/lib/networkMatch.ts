/**
 * Network mismatch detection.
 *
 * A signed transaction is only valid on the network it was signed for. The
 * app is built for one network (EXPO_PUBLIC_STELLAR_NETWORK), the wallet was
 * connected while the app was on some network, and the API serves one
 * network. If any of these disagree, submitting would fail at best and act on
 * the wrong ledger at worst, so submission is blocked until they match.
 */

export type StellarNetwork = 'testnet' | 'mainnet';

export function parseNetwork(value: unknown): StellarNetwork | null {
  return value === 'testnet' || value === 'mainnet' ? value : null;
}

/** The network this app build targets. */
export const APP_NETWORK: StellarNetwork =
  parseNetwork(process.env.EXPO_PUBLIC_STELLAR_NETWORK) ?? 'testnet';

export function networkLabel(network: StellarNetwork): string {
  return network === 'mainnet' ? 'Mainnet' : 'Testnet';
}

export interface NetworkMatchInput {
  /** Network the wallet was connected on; null when unknown (older sessions). */
  walletNetwork: StellarNetwork | null;
  appNetwork: StellarNetwork;
  /** Network the API reports; null when it could not be determined. */
  apiNetwork: StellarNetwork | null;
}

export type NetworkMatch =
  | { ok: true }
  | {
      ok: false;
      /** The network transactions must be on. */
      expected: StellarNetwork;
      /** Which side disagrees with the app. */
      source: 'wallet' | 'api';
      message: string;
    };

/**
 * Compare the wallet's and the API's network with the app's. Unknown values
 * (null) never block: only a positive disagreement does.
 */
export function checkNetworkMatch({
  walletNetwork,
  appNetwork,
  apiNetwork,
}: NetworkMatchInput): NetworkMatch {
  const expected = networkLabel(appNetwork);

  if (walletNetwork && walletNetwork !== appNetwork) {
    return {
      ok: false,
      expected: appNetwork,
      source: 'wallet',
      message:
        `Your wallet was connected on ${networkLabel(walletNetwork)}, but this app uses ` +
        `${expected}. Reconnect your wallet on ${expected} to submit transactions.`,
    };
  }

  if (apiNetwork && apiNetwork !== appNetwork) {
    return {
      ok: false,
      expected: appNetwork,
      source: 'api',
      message:
        `This app uses ${expected}, but the server is on ${networkLabel(apiNetwork)}. ` +
        `Transactions are blocked until they match. Reconnect after switching to a ${expected} build.`,
    };
  }

  return { ok: true };
}

export class NetworkMismatchError extends Error {
  constructor(
    message: string,
    readonly expected: StellarNetwork,
  ) {
    super(message);
    this.name = 'NetworkMismatchError';
  }
}

export interface NetworkCheckDeps {
  getWalletNetwork: () => StellarNetwork | null;
  fetchApiNetwork: () => Promise<StellarNetwork | null>;
  appNetwork?: StellarNetwork;
}

/**
 * Check the networks right before submitting and throw NetworkMismatchError
 * on a mismatch. If the API's network cannot be fetched, only the wallet is
 * checked (the submission itself will then surface any connectivity error).
 */
export async function assertNetworkMatch({
  getWalletNetwork,
  fetchApiNetwork,
  appNetwork = APP_NETWORK,
}: NetworkCheckDeps): Promise<void> {
  const apiNetwork = await fetchApiNetwork().catch(() => null);
  const match = checkNetworkMatch({ walletNetwork: getWalletNetwork(), appNetwork, apiNetwork });
  if (!match.ok) throw new NetworkMismatchError(match.message, match.expected);
}
