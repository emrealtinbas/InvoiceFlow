import { describe, expect, it } from 'vitest';

import {
  buildLoginPath,
  buildRegisterPath,
  currentReturnPath,
  loginPathForLocation,
  safeReturnPath,
} from '@/features/auth/session/return-path';

describe('safeReturnPath', () => {
  it('accepts same-origin application paths with query and hash', () => {
    expect(safeReturnPath('/customers')).toBe('/customers');
    expect(safeReturnPath('/invoices?status=Draft&page=2#items')).toBe(
      '/invoices?status=Draft&page=2#items',
    );
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    'dashboard',
    'https://evil.example/path',
    '//evil.example/path',
    '/\\evil.example',
    '/login',
    '/register',
    '/LOGIN/',
    '/login?returnTo=%2Fdashboard',
    'javascript:alert(1)',
    '/customers\nInjected',
    '/..//evil.example',
  ])('rejects unsafe value %s', (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it('builds login and registration paths without leaking unsafe values', () => {
    expect(buildLoginPath('/customers')).toBe('/login?returnTo=%2Fcustomers');
    expect(buildLoginPath('https://evil.example')).toBe('/login');
    expect(buildLoginPath('/invoices', { registered: true })).toBe(
      '/login?returnTo=%2Finvoices&registered=1',
    );
    expect(buildRegisterPath('/customers')).toBe('/register?returnTo=%2Fcustomers');
    expect(buildRegisterPath('//evil.example')).toBe('/register');
  });

  it('derives a safe path from a router location', () => {
    expect(loginPathForLocation({ pathname: '/customers', search: '?page=2', hash: '#top' })).toBe(
      '/login?returnTo=%2Fcustomers%3Fpage%3D2%23top',
    );
    expect(currentReturnPath({ pathname: '/login', search: '', hash: '' })).toBeNull();
  });
});
