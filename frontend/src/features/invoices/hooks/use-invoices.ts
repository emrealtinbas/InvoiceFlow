import { useEffect, useRef } from 'react';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/session/context';
import { dashboardKeys } from '@/features/dashboard/api/query-keys';
import { useApiClient } from '@/lib/api';

import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  markInvoicePaid,
  sendInvoice,
  updateInvoice,
} from '../api/contracts';
import { invoiceKeys } from '../api/query-keys';
import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceLifecycleRequest,
  InvoiceListQuery,
  UpdateInvoiceRequest,
} from '../api/types';
import type { InvoiceListState } from '../utils/invoice-list-params';

function useInvoiceScope(): string {
  const { user } = useAuth();
  return user?.id ?? 'anonymous';
}

function toListQuery(state: InvoiceListState): InvoiceListQuery {
  return {
    pageNumber: state.pageNumber,
    pageSize: state.pageSize,
    ...(state.search === '' ? {} : { search: state.search }),
    ...(state.customerId === '' ? {} : { customerId: state.customerId }),
    ...(state.status === '' ? {} : { status: state.status }),
    ...(state.issueDateFrom === '' ? {} : { issueDateFrom: state.issueDateFrom }),
    ...(state.issueDateTo === '' ? {} : { issueDateTo: state.issueDateTo }),
    sortBy: state.sortBy,
    sortDirection: state.sortDirection,
  };
}

export function useInvoiceList(state: InvoiceListState) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useInvoiceScope();
  const query = toListQuery(state);
  const {
    pageNumber,
    pageSize,
    search,
    customerId,
    status,
    issueDateFrom,
    issueDateTo,
    sortBy,
    sortDirection,
  } = state;

  useEffect(() => {
    const obsoleteKey = invoiceKeys.list(scope, {
      pageNumber,
      pageSize,
      search,
      customerId,
      status,
      issueDateFrom,
      issueDateTo,
      sortBy,
      sortDirection,
    });

    return () => {
      void queryClient.cancelQueries({ queryKey: obsoleteKey, exact: true });
    };
  }, [
    queryClient,
    scope,
    pageNumber,
    pageSize,
    search,
    customerId,
    status,
    issueDateFrom,
    issueDateTo,
    sortBy,
    sortDirection,
  ]);

  return useQuery({
    queryKey: invoiceKeys.list(scope, state),
    queryFn: ({ signal }) => listInvoices(client, query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string | undefined) {
  const client = useApiClient();
  const scope = useInvoiceScope();

  return useQuery({
    queryKey: invoiceKeys.detail(scope, id ?? 'invalid'),
    queryFn: ({ signal }) => getInvoice(client, id ?? '', signal),
    enabled: id !== undefined,
  });
}

export function useCreateInvoice() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useInvoiceScope();

  return useMutation({
    retry: false,
    mutationFn: (request: CreateInvoiceRequest) => createInvoice(client, request),
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoiceKeys.detail(scope, invoice.id), invoice);
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.lists(scope) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all(scope) });
    },
  });
}

export function useUpdateInvoice() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useInvoiceScope();

  return useMutation({
    retry: false,
    mutationFn: ({ id, request }: { id: string; request: UpdateInvoiceRequest }) =>
      updateInvoice(client, id, request),
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoiceKeys.detail(scope, invoice.id), invoice);
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.lists(scope) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all(scope) });
    },
  });
}

type LifecycleMutationInput = { id: string; request: InvoiceLifecycleRequest };

function useLifecycleMutation(
  mutation: (
    client: ReturnType<typeof useApiClient>,
    id: string,
    request: InvoiceLifecycleRequest,
    signal?: AbortSignal,
  ) => Promise<Invoice>,
) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useInvoiceScope();
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return useMutation({
    retry: false,
    mutationFn: ({ id, request }: LifecycleMutationInput) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return mutation(client, id, request, controller.signal);
    },
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoiceKeys.detail(scope, invoice.id), invoice);
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.lists(scope) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all(scope) });
    },
  });
}

export function useSendInvoice() {
  return useLifecycleMutation(sendInvoice);
}

export function useMarkInvoicePaid() {
  return useLifecycleMutation(markInvoicePaid);
}

export function useCancelInvoice() {
  return useLifecycleMutation(cancelInvoice);
}

export function useDeleteInvoice() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const scope = useInvoiceScope();
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return useMutation({
    retry: false,
    mutationFn: ({ id, concurrencyToken }: { id: string; concurrencyToken: string }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return deleteInvoice(client, id, concurrencyToken, controller.signal);
    },
    onSuccess: (_result, { id }) => {
      queryClient.removeQueries({ queryKey: invoiceKeys.detail(scope, id) });
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.lists(scope) });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all(scope) });
    },
  });
}
