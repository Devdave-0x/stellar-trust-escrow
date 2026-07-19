'use client';

import TwoFactorChallenge from './TwoFactorChallenge.jsx';

export default function TwoFactorPage({ searchParams }) {
  return <TwoFactorChallenge mfaPendingToken={searchParams?.mfaPendingToken} />;
}