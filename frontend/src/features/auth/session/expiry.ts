import type { AuthStatus, SessionEndReason } from './types';

export const MAX_EXPIRY_MARGIN_MS = 30_000;
export const EXPIRY_MARGIN_RATIO = 0.1;

/**
 * Converts the server-reported lifetime into a conservative local deadline.
 *
 * Only the *duration* reported by the API is used, so a client clock that is offset
 * from the server does not shorten or extend the token beyond the intended lifetime.
 * Ten percent (capped at 30 seconds) is subtracted so the session is cleared before
 * the server would reject the token.
 */
export function calculateSessionExpiry(expiresInSeconds: number, now = Date.now()): number {
  const lifetimeMs = Math.max(0, expiresInSeconds) * 1_000;
  const marginMs = Math.min(MAX_EXPIRY_MARGIN_MS, Math.floor(lifetimeMs * EXPIRY_MARGIN_RATIO));

  return now + Math.max(0, lifetimeMs - marginMs);
}

export type { AuthStatus, SessionEndReason };
