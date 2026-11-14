import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BackToCustomersProps {
  to: string;
  label?: string;
}

export function BackToCustomers({ to, label = 'Back to customers' }: BackToCustomersProps) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
