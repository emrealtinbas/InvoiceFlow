import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseEnvironment } from '@/lib/config/env';

describe('environment configuration', () => {
  it('parses an absolute HTTP API base URL', () => {
    expect(parseEnvironment({ VITE_API_BASE_URL: 'http://localhost:8080' })).toEqual({
      apiBaseUrl: 'http://localhost:8080',
    });
  });

  it('trims whitespace and removes trailing slashes', () => {
    expect(parseEnvironment({ VITE_API_BASE_URL: '  https://api.example.test/v1/  ' })).toEqual({
      apiBaseUrl: 'https://api.example.test/v1',
    });
  });

  it('resolves the production same-origin mode from the browser origin', () => {
    expect(
      parseEnvironment({ VITE_API_BASE_URL: 'same-origin' }, 'https://invoiceflow.example'),
    ).toEqual({ apiBaseUrl: 'https://invoiceflow.example' });
    expect(() => parseEnvironment({ VITE_API_BASE_URL: 'same-origin' })).toThrow(
      /no browser origin/i,
    );
  });

  it('explains how to configure a missing value', () => {
    expect(() => parseEnvironment({})).toThrow(EnvironmentConfigurationError);
    expect(() => parseEnvironment({})).toThrow(/VITE_API_BASE_URL is required/i);
    expect(() => parseEnvironment({ VITE_API_BASE_URL: '   ' })).toThrow(
      /Copy frontend\/\.env\.example/i,
    );
  });

  it('rejects relative and malformed URLs', () => {
    expect(() => parseEnvironment({ VITE_API_BASE_URL: '/api' })).toThrow(
      /absolute http\(s\) URL/i,
    );
    expect(() => parseEnvironment({ VITE_API_BASE_URL: 'not a url' })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it('rejects non-HTTP protocols', () => {
    expect(() => parseEnvironment({ VITE_API_BASE_URL: 'ftp://localhost:8080' })).toThrow(
      /absolute http\(s\) URL/i,
    );
  });

  it('rejects embedded credentials so secrets never reach build configuration', () => {
    expect(() =>
      parseEnvironment({ VITE_API_BASE_URL: 'https://user:password@api.example.test' }),
    ).toThrow(/without embedded credentials/i);
  });
});
