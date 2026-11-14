/**
 * Authentication DTOs from InvoiceFlow API v1.0.0.
 *
 * Registration does not return a token. Login returns a bearer token with a lifetime in
 * seconds. There is no refresh-token endpoint and no server-side logout.
 */
export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  role: 'User';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds (1800 by default). */
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  email: string;
  roles: string[];
}
