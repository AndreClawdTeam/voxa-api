import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { TooManyRequestsError } from '../lib/errors';
import type { ApiKeyAuthenticatedRequest } from './authenticate-api-key';

export interface TierRateLimitOptions {
  /** Override max requests per window (useful for testing) */
  maxOverride?: number;
  /** Override window in ms (default: 60s) */
  windowMs?: number;
}

function getTierMax(req: Request): number {
  const authReq = req as ApiKeyAuthenticatedRequest;
  const tier = authReq.subscription?.tier ?? 'trial';
  if (tier === 'pro') return env.RATE_LIMIT_PRO_RPM;
  if (tier === 'basic') return env.RATE_LIMIT_BASIC_RPM;
  return env.RATE_LIMIT_TRIAL_RPM;
}

function getUserKey(req: Request): string {
  const authReq = req as ApiKeyAuthenticatedRequest;
  return authReq.user?.userId ?? (req.ip as string);
}

/**
 * Rate limiter dinâmico por tier de assinatura.
 * Key = userId (injetado pelo middleware authenticate-api-key).
 *
 * Headers retornados em cada resposta:
 *   X-RateLimit-Limit     — limite total da janela para o tier
 *   X-RateLimit-Remaining — requests restantes na janela atual
 *   X-RateLimit-Reset     — Unix timestamp do reset da janela
 */
export function createTierRateLimit(options?: TierRateLimitOptions) {
  return rateLimit({
    windowMs: options?.windowMs ?? 60 * 1000, // 1 minuto
    max: (req) => {
      if (options?.maxOverride !== undefined) {
        return options.maxOverride;
      }
      return getTierMax(req);
    },
    keyGenerator: getUserKey,
    legacyHeaders: true, // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
    standardHeaders: false,
    handler: (_req, res) => {
      const err = new TooManyRequestsError();
      res.status(429).json({ code: err.code, message: err.message });
    },
  });
}
