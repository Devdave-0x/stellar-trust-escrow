/**
 * Cross-tab session sync.
 *
 * When a tab logs out, disconnects its wallet or loses its token (expiry /
 * failed refresh), every other open tab is told so it drops its session and
 * protected pages redirect (RouteGuard) instead of continuing to show
 * privileged data.
 *
 * Primary transport is BroadcastChannel; the `storage` event on the token key
 * is a fallback for browsers without it (it only fires in other tabs).
 */

import { TOKEN_STORAGE_KEY } from './token';

export const SESSION_CHANNEL = 'ste-auth';
export const SESSION_ENDED = 'session-ended';

// Identifies this tab so it ignores its own broadcasts.
const TAB_ID = Math.random().toString(36).slice(2);

let sender = null;

function getSender() {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!sender) sender = new BroadcastChannel(SESSION_CHANNEL);
  return sender;
}

/** Tell other tabs that this tab's session ended. */
export function broadcastSessionEnded(reason) {
  try {
    getSender()?.postMessage({ type: SESSION_ENDED, reason, tabId: TAB_ID });
  } catch {
    // Channel closed or unavailable — the storage event still covers token removal.
  }
}

/**
 * Call `onSessionEnded(reason)` when another tab ends the session.
 * @returns {() => void} unsubscribe
 */
export function subscribeToSessionEnd(onSessionEnded) {
  if (typeof window === 'undefined') return () => {};

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SESSION_CHANNEL) : null;
  const onMessage = (event) => {
    if (event.data?.type === SESSION_ENDED && event.data.tabId !== TAB_ID) {
      onSessionEnded(event.data.reason);
    }
  };
  const onStorage = (event) => {
    if (event.key === TOKEN_STORAGE_KEY && event.oldValue && !event.newValue) {
      onSessionEnded('token-removed');
    }
  };

  channel?.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);

  return () => {
    channel?.removeEventListener('message', onMessage);
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
