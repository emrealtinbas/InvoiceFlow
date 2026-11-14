import type { MeResponse } from '../api/types';

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated';

/** Why the previous session ended. Used only for a clear re-authentication message. */
export type SessionEndReason = 'expired' | 'unauthorized' | 'signed-out';

export type AuthUser = MeResponse;

/** Token and identity are published together so they can never describe different users. */
export interface AuthSession {
  accessToken: string;
  user: AuthUser;
  /** Local receipt time in epoch milliseconds. */
  issuedAt: number;
  /** Conservative local deadline in epoch milliseconds. */
  expiresAt: number;
}

export type AuthState =
  | { status: 'anonymous'; reason: SessionEndReason | null }
  | { status: 'authenticating' }
  | { status: 'authenticated'; session: AuthSession };
