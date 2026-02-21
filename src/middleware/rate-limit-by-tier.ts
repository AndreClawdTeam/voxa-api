import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { TooManyRequestsError } from '../lib/errors';

/**
 * Opções de configuração para `createTierRateLimit`.
 */
export interface TierRateLimitOptions {
  /** Sobrescreve o máximo de requisições por janela (útil em testes). */
  maxOverride?: number;
  /** Sobrescreve a janela de tempo em ms (padrão: 60 000 ms = 1 minuto). */
  windowMs?: number;
}

/**
 * Retorna o limite de requisições por minuto com base no tier da assinatura do usuário.
 * Usa `req.subscription` injetado pelo middleware `authenticateApiKey`.
 *
 * @param req - Objeto de requisição do Express (com subscription injetada)
 * @returns Número máximo de requisições permitidas na janela de 1 minuto
 */
function getTierMax(req: Request): number {
  const tier = req.subscription?.tier ?? 'trial';
  if (tier === 'pro') return env.RATE_LIMIT_PRO_RPM;
  if (tier === 'basic') return env.RATE_LIMIT_BASIC_RPM;
  return env.RATE_LIMIT_TRIAL_RPM;
}

/**
 * Retorna a chave de identificação única para o rate limiter.
 * Usa o `userId` injetado por `authenticateApiKey`; cai de volta para o IP.
 *
 * @param req - Objeto de requisição do Express
 * @returns String identificadora (userId ou IP)
 */
function getUserKey(req: Request): string {
  return req.user?.userId ?? req.ip ?? 'unknown';
}

/**
 * Cria um middleware de rate limiting dinâmico por tier de assinatura.
 *
 * A chave de limitação é o `userId` (injetado pelo middleware `authenticateApiKey`).
 * O limite varia conforme o tier:
 * - `trial`  → `RATE_LIMIT_TRIAL_RPM` req/min (padrão: 20)
 * - `basic`  → `RATE_LIMIT_BASIC_RPM` req/min (padrão: 60)
 * - `pro`    → `RATE_LIMIT_PRO_RPM`   req/min (padrão: 300)
 *
 * Headers incluídos em cada resposta:
 * - `X-RateLimit-Limit`     — limite total da janela
 * - `X-RateLimit-Remaining` — requisições restantes na janela
 * - `X-RateLimit-Reset`     — Unix timestamp do reset
 *
 * @param options - Opções opcionais (override de max e windowMs para testes)
 * @returns Middleware Express configurado
 */
export function createTierRateLimit(options?: TierRateLimitOptions) {
  return rateLimit({
    windowMs: options?.windowMs ?? 60 * 1000,
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
