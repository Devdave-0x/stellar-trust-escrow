'use client';

import TwoFactorChallenge from './TwoFactorChallenge.jsx';

export default function TwoFactorPage({ mfaPendingToken, searchParams }) {
  return (
    <TwoFactorChallenge
      mfaPendingToken={mfaPendingToken ?? searchParams?.mfaPendingToken}
    />
  );
}