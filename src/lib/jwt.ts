import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

const JWT_ISSUER = 'voxa-api';
const JWT_AUDIENCE = 'voxa-api-clients';

// ─── In-memory refresh token blacklist ────────────────────────────────────────
// Maps jti → expiry timestamp (ms). Cleans up expired entries periodically.
// NOTE: This is a single-process in-memory store. For multi-instance deployments,
// replace with Redis (e.g. SET jti EX <ttl>).
const revokedTokens = new Map<string, number>();

function pruneExpiredJtis() {
  const now = Date.now();
  for (const [jti, expiresAt] of revokedTokens.entries()) {
    if (now >= expiresAt) revokedTokens.delete(jti);
  }
}

// Prune every 5 minutes to avoid unbounded memory growth
setInterval(pruneExpiredJtis, 5 * 60 * 1000).unref();

export function revokeRefreshToken(jti: string, expiresAt: number): void {
  revokedTokens.set(jti, expiresAt);
}

export function isRefreshTokenRevoked(jti: string): boolean {
  const expiresAt = revokedTokens.get(jti);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    revokedTokens.delete(jti);
    return false;
  }
  return true;
}

// ─── Token signing ────────────────────────────────────────────────────────────

export function signAccessToken(payload: { userId: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: { userId: string }): string {
  const jti = crypto.randomUUID();
  return jwt.sign({ ...payload, jti }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);
}

// ─── Token verification ───────────────────────────────────────────────────────

export function verifyToken(token: string): jwt.JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function verifyRefreshToken(token: string): jwt.JwtPayload & { jti: string } {
  const payload = verifyToken(token) as jwt.JwtPayload & { jti?: string };
  if (!payload.jti) {
    throw new UnauthorizedError('Invalid refresh token: missing jti');
  }
  if (isRefreshTokenRevoked(payload.jti)) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }
  return payload as jwt.JwtPayload & { jti: string };
}
