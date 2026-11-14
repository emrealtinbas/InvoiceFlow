import { useEffect, useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCustomer, useCustomerList } from '@/features/customers/hooks/use-customers';

interface CustomerSelectorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function CustomerSelector({ value, onChange, error, disabled }: CustomerSelectorProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const customers = useCustomerList({
    page,
    pageSize: 20,
    search,
    sortBy: 'name',
    sortDirection: 'asc',
  });
  const selected = useCustomer(value === '' ? undefined : value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const options = useMemo(() => {
    const items = customers.data?.items ?? [];
    if (selected.data !== undefined && !items.some((item) => item.id === selected.data?.id)) {
      return [selected.data, ...items];
    }
    return items;
  }, [customers.data?.items, selected.data]);

  const noCustomers = customers.data?.totalCount === 0 && search === '';

  return (
    <div className="space-y-2">
      <Label
        htmlFor="invoice-customer"
        className="after:ml-0.5 after:text-destructive after:content-['*']"
      >
        Customer
      </Label>
      <div className="relative">
        <Label htmlFor="customer-search" className="sr-only">
          Search customers
        </Label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="customer-search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search customers"
          className="pl-9"
          disabled={disabled}
        />
      </div>
      <Select
        id="invoice-customer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || customers.isPending}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'invoice-customer-error' : undefined}
      >
        <option value="">{customers.isPending ? 'Loading customers…' : 'Select a customer'}</option>
        {options.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.name}
            {customer.email ? ` — ${customer.email}` : ''}
          </option>
        ))}
      </Select>
      {error ? (
        <p id="invoice-customer-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {customers.isError ? (
        <p className="text-sm text-destructive">
          Customers could not be loaded. Try the search again.
        </p>
      ) : null}
      {customers.data !== undefined && customers.data.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Page {customers.data.page} of {customers.data.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Previous customer page"
              disabled={page <= 1 || disabled}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Next customer page"
              disabled={page >= customers.data.totalPages || disabled}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
      {customers.data !== undefined && customers.data.totalCount === 0 ? (
        <p className="text-sm text-muted-foreground">
          {noCustomers ? (
            <>
              No customers yet.{' '}
              <Link className="font-medium text-primary underline" to="/customers/new">
                Create a customer
              </Link>{' '}
              first.
            </>
          ) : (
            'No matching customers.'
          )}
        </p>
      ) : null}
    </div>
  );
}
