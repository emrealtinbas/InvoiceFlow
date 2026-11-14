import type { CustomerListState } from '../utils/customer-list-params';

/**
 * Customer query keys include the authenticated user id as defense in depth. The session
 * controller also clears the entire cache on sign-in, sign-out, and expiry, so data from
 * one account can never be rendered for another.
 */
export const customerKeys = {
  all: (scope: string) => ['customers', scope] as const,
  lists: (scope: string) => [...customerKeys.all(scope), 'list'] as const,
  list: (scope: string, state: CustomerListState) => [...customerKeys.lists(scope), state] as const,
  details: (scope: string) => [...customerKeys.all(scope), 'detail'] as const,
  detail: (scope: string, id: string) => [...customerKeys.details(scope), id] as const,
};
