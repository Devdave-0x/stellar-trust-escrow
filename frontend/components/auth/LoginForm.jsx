/**
 * LoginForm Component
 *
 * Wallet-based authentication form for Stellar Trust Escrow.
 * The user enters their Stellar address (or connects Freighter) to
 * receive a nonce challenge, which they sign to prove ownership.
 *
 * @param {object}   props
 * @param {Function} props.onSubmit   - (address: string) => Promise<void>
 * @param {boolean}  [props.loading]  - show loading state during auth
 * @param {string}   [props.error]    - server-side error message to display
 */

'use client';

import { useState } from 'react';
import StellarAddressInput from '../ui/StellarAddressInput';

export default function LoginForm({ onSubmit, loading = false, error = null }) {
  const [address, setAddress] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (address.trim()) {
      onSubmit(address.trim());
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Sign in"
      className="space-y-6"
      data-testid="login-form"
      noValidate
    >
      <fieldset>
        <legend className="text-lg font-semibold text-white mb-4">
          Sign in with your Stellar wallet
        </legend>

        <StellarAddressInput
          id="login-address"
          label="Stellar Address"
          placeholder="GABCD1234..."
          value={address}
          onChange={setAddress}
          required
        />

        {error && (
          <div
            id="login-error"
            role="alert"
            aria-live="assertive"
            className="mt-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm"
          >
            {error}
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={loading || !address.trim()}
        aria-busy={loading}
        aria-describedby={error ? 'login-error' : undefined}
        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500
                   text-white font-medium rounded-lg transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>

      <p className="text-xs text-gray-500 text-center">
        You will be asked to sign a nonce with your Stellar private key.
        No password required.
      </p>
    </form>
  );
}
