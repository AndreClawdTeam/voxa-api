import { describe, expect, it } from 'vitest';
import {
  isRefreshTokenRevoked,
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyToken,
} from './jwt';

// Mocking env is handled by the actual env.ts reading test/.env or process.env
// In test context JWT_SECRET is set via vitest env setup or .env.test

describe('JWT iss/aud claims', () => {
  it('access token should be verifiable with correct iss/aud', () => {
    const token = signAccessToken({ userId: 'user-1', role: 'customer' });
    const payload = verifyToken(token);
    expect(payload.userId).toBe('user-1');
    expect(payload.iss).toBe('voxa-api');
    expect(payload.aud).toBe('voxa-api-clients');
  });

  it('refresh token should contain jti claim', () => {
    const token = signRefreshToken({ userId: 'user-1' });
    const payload = verifyRefreshToken(token);
    expect(payload.jti).toBeDefined();
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(0);
  });

  it('verifyToken should reject a token with wrong iss/aud (cross-service reuse)', () => {
    // Create a token using raw jsonwebtoken without iss/aud
    const jwt = require('jsonwebtoken');
    const tampered = jwt.sign(
      { userId: 'attacker', role: 'admin' },
      process.env.JWT_SECRET ?? 'test-secret-must-be-at-least-32-chars-long',
      {
        expiresIn: '15m',
        // NO issuer / audience — cross-service attack simulation
      },
    );
    // verifyToken should reject because issuer/audience don't match
    expect(() => verifyToken(tampered)).toThrow('Invalid or expired token');
  });
});

describe('Refresh token blacklist', () => {
  it('should mark a jti as revoked', () => {
    const jti = 'test-jti-revoke-1';
    const futureExp = Date.now() + 60_000;

    expect(isRefreshTokenRevoked(jti)).toBe(false);
    revokeRefreshToken(jti, futureExp);
    expect(isRefreshTokenRevoked(jti)).toBe(true);
  });

  it('should treat expired jti entries as not revoked (prune)', () => {
    const jti = 'test-jti-expired';
    const pastExp = Date.now() - 1; // already expired

    revokeRefreshToken(jti, pastExp);
    // Should be treated as "not revoked" because the jti itself is expired
    expect(isRefreshTokenRevoked(jti)).toBe(false);
  });

  it('verifyRefreshToken should reject a revoked token', () => {
    const token = signRefreshToken({ userId: 'user-revoke-test' });
    const payload = verifyRefreshToken(token);

    // Revoke it
    const exp = payload.exp ? payload.exp * 1000 : Date.now() + 60_000;
    revokeRefreshToken(payload.jti, exp);

    // Now it should be rejected
    expect(() => verifyRefreshToken(token)).toThrow('revoked');
  });
});
