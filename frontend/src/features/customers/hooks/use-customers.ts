import { useEffect } from 'react';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/session/context';
import { dashboardKeys } from '@/features/dashboard/api/query-keys';
import { useApiClient } from '@/lib/api';

import {
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from '../api/contracts';
import { customerKeys } from '../api/query-keys';
import type { CreateCustomerRequest, CustomerListQuery, UpdateCustomerRequest } from '../api/types';
import type { CustomerListState } from '../utils/customer-list-params';

function useCustomerScope(): string {
  const { user } = useAuth();

  return user?.id ?? 'anonymous';
}

function toListQuery(state: CustomerListState): CustomerListQuery {
  return {
    page: state.page,
    pageSize: state.pageSize,
    ...(state.search === '' ? {} : { search: state.search }),
    sortBy: state.sortBy,
    sortDirection: state.sortDirection,
  };
}

/**
 * List queries are keyed by the authenticated user and every list parameter. When the
 * key changes, the previous in-flight request is cancelled so obsolete searches cannot
 * keep consuming the network or resolve into the next result.
 */
export function useCustomerList(state: CustomerListState) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useCustomerScope();
  const query = toListQuery(state);
  const { page, pageSize, search, sortBy, sortDirection } = state;

  useEffect(() => {
    const obsoleteKey = customerKeys.list(scope, {
      page,
      pageSize,
      search,
      sortBy,
      sortDirection,
    });

    return () => {
      void queryClient.cancelQueries({ queryKey: obsoleteKey, exact: true });
    };
  }, [queryClient, scope, page, pageSize, search, sortBy, sortDirection]);

  return useQuery({
    queryKey: customerKeys.list(scope, state),
    queryFn: ({ signal }) => listCustomers(client, query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string | undefined) {
  const client = useApiClient();
  const scope = useCustomerScope();

  return useQuery({
    queryKey: customerKeys.detail(scope, id ?? 'invalid'),
    queryFn: ({ signal }) => getCustomer(client, id ?? '', signal),
    enabled: id !== undefined,
  });
}

export function useCreateCustomer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useCustomerScope();

  return useMutation({
    retry: false,
    mutationFn: (request: CreateCustomerRequest) => createCustomer(client, request),
    onSuccess: (customer) => {
      queryClient.setQueryData(customerKeys.detail(scope, customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: customerKeys.lists(scope) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all(scope) });
    },
  });
}

export function useUpdateCustomer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useCustomerScope();

  return useMutation({
    retry: false,
    mutationFn: ({ id, request }: { id: string; request: UpdateCustomerRequest }) =>
      updateCustomer(client, id, request),
    onSuccess: (customer) => {
      queryClient.setQueryData(customerKeys.detail(scope, customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: customerKeys.all(scope) });
    },
  });
}

export function useDeleteCustomer() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useCustomerScope();

  return useMutation({
    retry: false,
    mutationFn: (id: string) => deleteCustomer(client, id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: customerKeys.detail(scope, id) });
      void queryClient.invalidateQueries({ queryKey: customerKeys.lists(scope) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all(scope) });
    },
  });
}
