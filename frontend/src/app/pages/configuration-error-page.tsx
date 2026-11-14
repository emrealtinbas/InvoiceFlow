import { FatalErrorView } from '@/components/shared/fatal-error-view';

interface ConfigurationErrorPageProps {
  message: string;
}

/** Rendered before the router when environment validation fails. */
export function ConfigurationErrorPage({ message }: ConfigurationErrorPageProps) {
  return (
    <FatalErrorView
      title="Configuration error"
      description="InvoiceFlow Web could not start because its environment is invalid. Fix the configuration and reload the page."
      details={message}
    />
  );
}
