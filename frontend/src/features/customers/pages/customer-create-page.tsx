import { useMemo } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';

import type { CustomerWriteRequest } from '../api/types';
import { BackToCustomers } from '../components/back-to-customers';
import { CustomerForm } from '../components/customer-form';
import { useCreateCustomer } from '../hooks/use-customers';
import { emptyCustomerFormValues } from '../schemas/customer-schemas';
import { listPathFromRouterState } from '../utils/customer-list-params';
import { describeCustomerSaveError } from '../utils/customer-errors';

export function CustomerCreatePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromList = listPathFromRouterState(location.state);
  const createCustomer = useCreateCustomer();
  const serverError = useMemo(
    () => (createCustomer.error === null ? null : describeCustomerSaveError(createCustomer.error)),
    [createCustomer.error],
  );

  function handleSubmit(request: CustomerWriteRequest): void {
    if (createCustomer.isPending) {
      return;
    }

    createCustomer.mutate(request, {
      onSuccess: (customer) => {
        toast.success('Customer created.');
        navigate(`/customers/${customer.id}`, { state: { fromList } });
      },
    });
  }

  return (
    <div className="space-y-6">
      <BackToCustomers to={fromList} label="Back to customers" />
      <PageHeader
        title="New customer"
        description="Create a customer for your account. Required fields are marked; optional fields can be left blank and are stored as null."
        badge="Phase 3"
      />
      <Card>
        <CardContent>
          <CustomerForm
            defaultValues={emptyCustomerFormValues()}
            submitLabel="Create customer"
            pendingLabel="Creating…"
            isPending={createCustomer.isPending}
            serverError={serverError}
            onSubmit={handleSubmit}
            cancelTo={fromList}
          />
        </CardContent>
      </Card>
    </div>
  );
}
