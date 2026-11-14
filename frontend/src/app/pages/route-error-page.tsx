import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { FatalErrorView } from '@/components/shared/fatal-error-view';
import { Button } from '@/components/ui/button';

export function RouteErrorPage() {
  const error = useRouteError();

  const details = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'The route could not be rendered.';

  return (
    <FatalErrorView
      title="This page could not be loaded"
      description="A routing error interrupted navigation. Return to the dashboard to continue."
      details={details}
      action={
        <Button asChild>
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
