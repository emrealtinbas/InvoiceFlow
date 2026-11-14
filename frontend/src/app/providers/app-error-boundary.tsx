import { Component, type ErrorInfo, type ReactNode } from 'react';

import { FatalErrorView } from '@/components/shared/fatal-error-view';
import { Button } from '@/components/ui/button';
import { EnvironmentConfigurationError } from '@/lib/config/env';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time failures in the application shell. It never displays stack traces;
 * the message is limited to the error's public message.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('Unhandled application error', error, info.componentStack);
    }
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;

    if (error !== null) {
      const isConfigurationError = error instanceof EnvironmentConfigurationError;

      return (
        <FatalErrorView
          title={isConfigurationError ? 'Configuration error' : 'Something went wrong'}
          description={
            isConfigurationError
              ? 'The frontend could not start because its environment is invalid.'
              : 'An unexpected error interrupted the application. You can try rendering it again.'
          }
          details={error.message}
          action={
            <Button onClick={this.handleReset} className="w-full sm:w-auto">
              Try again
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
