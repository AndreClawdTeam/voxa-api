import * as crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors';
import { ApiKeysRepository } from '../modules/api-keys/api-keys.repository';
import { SubscriptionsRepository } from '../modules/subscriptions/subscriptions.repository';

export interface ApiKeyAuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
  apiKeyId: string;
  subscription: {
    tier: 'trial' | 'basic' | 'pro';
    status: string;
  } | null;
}

const repo = new ApiKeysRepository();
const subscriptionsRepo = new SubscriptionsRepository();

export async function authenticateApiKey(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid authorization header'));
  }

  const token = authHeader.slice(7);

  if (!token.startsWith('vxa_')) {
    return next(new UnauthorizedError('Invalid API key format'));
  }

  const keyHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const apiKey = await repo.findByHash(keyHash);

    if (!apiKey) {
      return next(new UnauthorizedError('Invalid or revoked API key'));
    }

    // Inject user and apiKeyId into request
    const authenticatedReq = req as ApiKeyAuthenticatedRequest;
    authenticatedReq.user = {
      userId: apiKey.userId,
      role: 'customer',
    };
    authenticatedReq.apiKeyId = apiKey.id;

    // Fetch and inject subscription for rate limiting
    const subscription = await subscriptionsRepo.findByUserId(apiKey.userId);
    authenticatedReq.subscription = subscription
      ? { tier: subscription.tier, status: subscription.status }
      : null;

    // Update last used (async, don't await)
    repo.updateLastUsed(apiKey.id).catch(() => {});

    return next();
  } catch (error) {
    return next(error);
  }
}
