import { z } from 'zod';

import type { ApiClient } from '@/lib/api';
import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  RegisterRequest,
  RegisterResponse,
} from './types';

/**
 * The API contract is authoritative, but the browser must still fail closed when a
 * proxy, captive portal, or incompatible deployment returns an unexpected payload.
 * These schemas validate only the fields the frontend consumes.
 */
const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive().max(86_400),
});

const registerResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: z.literal('User'),
});

const meResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  roles: z.array(z.string()),
});

/** Raised when a successful auth response does not match the documented contract. */
export class AuthContractError extends Error {
  constructor() {
    super('The authentication service returned an unexpected response.');
    this.name = 'AuthContractError';
  }
}

/** Raised when login succeeded but the issued identity could not be loaded from `/me`. */
export class IdentityVerificationError extends Error {
  constructor(options?: ErrorOptions) {
    super('The signed-in identity could not be verified.', options);
    this.name = 'IdentityVerificationError';
  }
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AuthContractError();
  }

  return result.data;
}

/** Exchanges credentials for a bearer token. This request never carries a token. */
export async function login(
  client: ApiClient,
  credentials: LoginRequest,
  signal?: AbortSignal,
): Promise<LoginResponse> {
  const payload = await client.post<unknown>('/api/auth/login', credentials, {
    auth: false,
    ...(signal ? { signal } : {}),
  });

  return validate(loginResponseSchema, payload);
}

/** Creates an account. The API deliberately does not return a token. */
export async function register(
  client: ApiClient,
  request: RegisterRequest,
): Promise<RegisterResponse> {
  const payload = await client.post<unknown>('/api/auth/register', request, { auth: false });

  return validate(registerResponseSchema, payload);
}

/**
 * Loads the verified identity for a freshly issued token.
 *
 * The bearer header is supplied explicitly and the request opts out of the global
 * authenticated-401 handler: a failed identity lookup is a login failure, not an
 * invalidation of an established session.
 */
export async function loadCurrentUser(
  client: ApiClient,
  accessToken: string,
  signal?: AbortSignal,
): Promise<MeResponse> {
  const payload = await client.get<unknown>('/api/auth/me', {
    auth: false,
    headers: { Authorization: `Bearer ${accessToken}` },
    ...(signal ? { signal } : {}),
  });

  return validate(meResponseSchema, payload);
}
