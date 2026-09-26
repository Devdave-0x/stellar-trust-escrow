import SharedEscrowView from './SharedEscrowView';

const APP_SCHEME = 'stellartrustescrow';
const ANDROID_PACKAGE = 'com.stellartrustescrow.app';
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Deep-link metadata so the mobile app opens this share link directly
 * (App Links for Android/iOS and the Smart App Banner argument). Invalid
 * tokens get no deep link.
 */
export async function generateMetadata({ params }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return { title: 'Shared escrow' };
  const deepLink = `${APP_SCHEME}://share/${token}`;
  return {
    title: 'Shared escrow',
    robots: { index: false, follow: false },
    other: {
      'al:ios:url': deepLink,
      'al:ios:app_name': 'StellarTrustEscrow',
      'al:android:url': deepLink,
      'al:android:package': ANDROID_PACKAGE,
      'al:android:app_name': 'StellarTrustEscrow',
      'apple-itunes-app': `app-argument=${deepLink}`,
    },
  };
}

export default async function SharedEscrowPage({ params }) {
  const { token } = await params;
  return <SharedEscrowView token={token} validToken={TOKEN_RE.test(token)} appScheme={APP_SCHEME} />;
}
