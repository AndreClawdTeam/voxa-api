import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

const JWT_ISSUER = 'voxa-api';
const JWT_AUDIENCE = 'voxa-api-clients';

// ─── Payload schemas (Zod) ────────────────────────────────────────────────────

/**
 * Schema Zod para o payload de um access token.
 * Garante tipagem segura sem type assertions.
 */
const accessTokenPayloadSchema = z.object({
  userId: z.string(),
  role: z.string(),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  exp: z.number().optional(),
  iat: z.number().optional(),
  jti: z.string().optional(),
});

/**
 * Schema Zod para o payload de um refresh token.
 * Garante tipagem segura sem type assertions.
 */
const refreshTokenPayloadSchema = z.object({
  userId: z.string(),
  jti: z.string(),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  exp: z.number().optional(),
  iat: z.number().optional(),
});

/** Payload tipado de um access token após verificação. */
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

/** Payload tipado de um refresh token após verificação. */
export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>;

// ─── In-memory refresh token blacklist ────────────────────────────────────────
// Maps jti → expiry timestamp (ms). Cleans up expired entries periodically.
// NOTE: This is a single-process in-memory store. For multi-instance deployments,
// replace with Redis (e.g. SET jti EX <ttl>).
const revokedTokens = new Map<string, number>();

/**
 * Remove entradas expiradas do blacklist para evitar crescimento ilimitado de memória.
 */
function pruneExpiredJtis(): void {
  const now = Date.now();
  for (const [jti, expiresAt] of revokedTokens.entries()) {
    if (now >= expiresAt) revokedTokens.delete(jti);
  }
}

// Prune every 5 minutes to avoid unbounded memory growth
setInterval(pruneExpiredJtis, 5 * 60 * 1000).unref();

/**
 * Adiciona um jti ao blacklist de refresh tokens revogados.
 *
 * @param jti - JWT ID do token a revogar
 * @param expiresAt - Timestamp (ms) de expiração do token; a entrada é removida após esse momento
 */
export function revokeRefreshToken(jti: string, expiresAt: number): void {
  revokedTokens.set(jti, expiresAt);
}

/**
 * Verifica se um jti está na lista de refresh tokens revogados.
 *
 * @param jti - JWT ID a verificar
 * @returns `true` se o token foi explicitamente revogado e ainda não expirou
 */
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

/**
 * Assina um access token JWT com `userId` e `role` no payload.
 *
 * @param payload - Dados do usuário a incluir no token
 * @returns JWT assinado como string
 */
export function signAccessToken(payload: { userId: string; role: string }): string {
  const options: jwt.SignOptions = {
    // @ts-expect-error — env.JWT_EXPIRES_IN is a Zod-validated ms-compatible string (e.g. "15m").
    // The @types/jsonwebtoken branded StringValue type cannot be satisfied without an assertion;
    // jsonwebtoken accepts any valid ms string at runtime.
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * Assina um refresh token JWT com `userId` e um `jti` gerado aleatoriamente.
 * O `jti` permite a revogação individual do token sem invalidade outros tokens do usuário.
 *
 * @param payload - Objeto com o `userId` do dono do token
 * @returns JWT de refresh assinado como string
 */
export function signRefreshToken(payload: { userId: string }): string {
  const jti = crypto.randomUUID();
  const options: jwt.SignOptions = {
    // @ts-expect-error — env.JWT_REFRESH_EXPIRES_IN is a Zod-validated ms-compatible string (e.g. "7d").
    // Same branded StringValue constraint as signAccessToken.
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign({ ...payload, jti }, env.JWT_SECRET, options);
}

// ─── Token verification ───────────────────────────────────────────────────────

/**
 * Verifica e decodifica um access token JWT.
 * Valida assinatura, expiração, issuer, audience e formato do payload via Zod.
 *
 * @param token - JWT a verificar
 * @returns Payload tipado do access token
 * @throws {UnauthorizedError} Se o token for inválido, expirado ou malformado
 */
export function verifyToken(token: string): AccessTokenPayload {
  try {
    const raw = jwt.verify(token, env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (typeof raw === 'string') {
      throw new UnauthorizedError('Invalid or expired token');
    }

    return accessTokenPayloadSchema.parse(raw);
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Verifica e decodifica um refresh token JWT.
 * Além da verificação padrão, garante que o token não foi revogado (blacklist por jti).
 *
 * @param token - JWT de refresh a verificar
 * @returns Payload tipado do refresh token (inclui `jti`)
 * @throws {UnauthorizedError} Se o token for inválido, expirado ou revogado
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const raw = jwt.verify(token, env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (typeof raw === 'string') {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const payload = refreshTokenPayloadSchema.parse(raw);

    if (isRefreshTokenRevoked(payload.jti)) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}
