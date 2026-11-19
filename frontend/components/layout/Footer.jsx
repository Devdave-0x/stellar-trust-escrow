/**
 * Footer Component
 * Links to the deployed contract on Stellar Expert are built from the
 * active network configuration so testnet/mainnet point to the matching
 * explorer. Unknown networks render a safe disabled state (no link).
 */
import { getNetworkConfig } from '@/lib/network';

const EXPLORER_BASE_URLS = {
  testnet: 'https://stellar.expert/explorer/testnet',
  mainnet: 'https://stellar.expert/explorer/public',
  public: 'https://stellar.expert/explorer/public',
};

function resolveExplorerBaseUrl(network) {
  if (!network || typeof network !== 'string') return null;
  const key = network.toLowerCase();
  return EXPLORER_BASE_URLS[key] || null;
}

export default function Footer() {
  const config = getNetworkConfig();
  const network = config?.network;
  const contractId = config?.contractId;
  const explorerBaseUrl = resolveExplorerBaseUrl(network);

  const contractHref =
    explorerBaseUrl && contractId
      ? `${explorerBaseUrl}/contract/${contractId}`
      : null;

  return (
    <footer className="border-t border-gray-800 py-6 mt-12">
      <div className="container mx-auto px-4 max-w-7xl flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-gray-500">
        <p>© 2025 StellarTrustEscrow — MIT License</p>
        <div className="flex gap-4">
          <a
            href="https://github.com/your-org/stellar-trust-escrow"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <a href="/docs" className="hover:text-white transition-colors">
            Docs
          </a>
          {contractHref ? (
            <a
              href={contractHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Contract: {contractId}
            </a>
          ) : (
            <span className="text-gray-700" aria-disabled="true">
              Contract: —
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
</｜｜DSML｜｜ parameter>