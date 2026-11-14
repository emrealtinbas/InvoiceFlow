import { createContext, useContext } from 'react';

import type { LoginRequest } from '../api/types';
import type { AuthStatus, AuthUser, SessionEndReason } from './types';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Conservative local expiry in epoch milliseconds while authenticated. */
  expiresAt: number | null;
  /** Set only for the anonymous state so the login page can explain the transition. */
  endReason: SessionEndReason | null;
  isAuthenticated: boolean;
  /** Completes only after login and `/api/auth/me` both succeed. */
  signIn: (credentials: LoginRequest) => Promise<void>;
  /** Clears the local session immediately. The stateless JWT is not revoked server-side. */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
