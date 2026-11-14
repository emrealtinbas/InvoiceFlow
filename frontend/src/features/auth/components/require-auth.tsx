import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../session/context';
import { loginPathForLocation } from '../session/return-path';
import { SessionLoadingScreen } from './session-loading-screen';

/** Blocks protected routes until a verified identity exists. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'authenticating') {
    return <SessionLoadingScreen />;
  }

  if (status !== 'authenticated') {
    return <Navigate to={loginPathForLocation(location)} replace />;
  }

  return <Outlet />;
}
