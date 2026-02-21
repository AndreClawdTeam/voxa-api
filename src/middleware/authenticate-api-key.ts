import * as crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors';
import type { ApiKeysRepository } from '../modules/api-keys/api-keys.repository';
import type { SubscriptionsRepository } from '../modules/subscriptions/subscriptions.repository';

interface AuthenticateApiKeyDeps {
  apiKeysRepo: ApiKeysRepository;
  subscriptionsRepo: SubscriptionsRepository;
}

/**
 * Factory que retorna o middleware de autenticação via API Key.
 * As dependências são injetadas pelo caller (composition root).
 *
 * Valida a chave pesquisando o hash SHA-256 no banco de dados. Injeta `req.user`,
 * `req.apiKeyId` e `req.subscription` na requisição para uso em middlewares e
 * controllers subsequentes.
 *
 * @throws {UnauthorizedError} Se o header estiver ausente, malformado, ou a key for inválida/revogada
 */
export function createAuthenticateApiKey({
  apiKeysRepo,
  subscriptionsRepo,
}: AuthenticateApiKeyDeps) {
  return async function authenticateApiKey(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid authorization header'));
      return;
    }

    const token = authHeader.slice(7);

    if (!token.startsWith('vxa_')) {
      next(new UnauthorizedError('Invalid API key format'));
      return;
    }

    const keyHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
      const apiKey = await apiKeysRepo.findByHash(keyHash);

      if (!apiKey) {
        next(new UnauthorizedError('Invalid or revoked API key'));
        return;
      }

      // Inject user and apiKeyId into request
      req.user = {
        userId: apiKey.userId,
        role: 'customer',
      };
      req.apiKeyId = apiKey.id;

      // Fetch and inject subscription for rate limiting
      const subscription = await subscriptionsRepo.findByUserId(apiKey.userId);
      req.subscription = subscription
        ? { tier: subscription.tier, status: subscription.status }
        : null;

      // Update last used timestamp asynchronously — fire and forget
      apiKeysRepo.updateLastUsed(apiKey.id).catch(() => {});

      next();
    } catch (error) {
      next(error);
    }
  };
}
