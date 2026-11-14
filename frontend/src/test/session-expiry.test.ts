import { describe, expect, it } from 'vitest';

import { calculateSessionExpiry, MAX_EXPIRY_MARGIN_MS } from '@/features/auth/session/expiry';

describe('calculateSessionExpiry', () => {
  it('subtracts a conservative margin before the server deadline', () => {
    const now = 1_000_000;

    expect(calculateSessionExpiry(1_800, now)).toBe(now + 1_800_000 - MAX_EXPIRY_MARGIN_MS);
  });

  it('uses ten percent for lifetimes below five minutes', () => {
    const now = 1_000_000;

    expect(calculateSessionExpiry(100, now)).toBe(now + 90_000);
  });

  it('never returns a deadline beyond the reported lifetime', () => {
    const now = 1_000_000;

    expect(calculateSessionExpiry(0, now)).toBe(now);
    expect(calculateSessionExpiry(-30, now)).toBe(now);
  });
});
