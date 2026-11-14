import { Navigate, Outlet, useSearchParams } from 'react-router-dom';

import { useAuth } from '../session/context';
import { safeReturnPath } from '../session/return-path';

/** Keeps an authenticated user out of the login and registration pages. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  const [searchParams] = useSearchParams();

  if (status === 'authenticated') {
    return <Navigate to={safeReturnPath(searchParams.get('returnTo')) ?? '/dashboard'} replace />;
  }

  return <Outlet />;
}
