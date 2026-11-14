const AUTH_PATHS = new Set(['/login', '/register']);
const APP_ORIGIN = 'http://invoiceflow.invalid';

/**
 * Returns a same-origin application path or null.
 *
 * Return paths are accepted from the URL, so they are treated as untrusted input. The
 * helper rejects absolute URLs, protocol-relative URLs, backslash tricks, control
 * characters, and the authentication pages themselves to prevent redirect loops.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const candidate = value.trim();

  if (
    candidate === '' ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    hasControlCharacters(candidate)
  ) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(candidate, APP_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== APP_ORIGIN) {
    return null;
  }

  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

  if (AUTH_PATHS.has(normalizedPath.toLowerCase())) {
    return null;
  }

  const path = `${url.pathname}${url.search}${url.hash}`;

  if (path.startsWith('//') || path.includes('\\')) {
    return null;
  }

  return path;
}

interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

/** Builds a return path from a router location, dropping it when it is unsafe. */
export function currentReturnPath(location: LocationLike): string | null {
  return safeReturnPath(`${location.pathname}${location.search}${location.hash}`);
}

/** Builds `/login`, optionally preserving a safe destination and registration state. */
export function buildLoginPath(
  returnTo?: string | null,
  options: { registered?: boolean } = {},
): string {
  const params = new URLSearchParams();
  const safeReturnTo = safeReturnPath(returnTo);

  if (safeReturnTo !== null) {
    params.set('returnTo', safeReturnTo);
  }

  if (options.registered) {
    params.set('registered', '1');
  }

  const query = params.toString();

  return query === '' ? '/login' : `/login?${query}`;
}

/** Builds the registration link while preserving a safe destination for later login. */
export function buildRegisterPath(returnTo?: string | null): string {
  const safeReturnTo = safeReturnPath(returnTo);

  return safeReturnTo === null
    ? '/register'
    : `/register?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

/** Builds the login redirect used by protected-route guards. */
export function loginPathForLocation(location: LocationLike): string {
  return buildLoginPath(currentReturnPath(location));
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);

    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }

  return false;
}
