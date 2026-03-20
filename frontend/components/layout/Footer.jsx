/**
 * Footer Component
 * TODO (contributor — easy, Issue #38): add real links and contract address display
 */
export default function Footer() {
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
          {/* TODO (contributor): link to deployed contract on Stellar Expert */}
          <span className="text-gray-700">Contract: —</span>
        </div>
      </div>
    </footer>
  );
}
