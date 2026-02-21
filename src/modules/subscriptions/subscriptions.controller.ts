import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { requireUser, sendSuccess, sendSuccessWithMessage } from '../../lib/http';
import { parseBody } from '../../lib/validation';
import type { SubscriptionsService } from './subscriptions.service';

const upgradePlanSchema = z.object({
  tier: z.enum(['basic', 'pro'], {
    errorMap: () => ({ message: 'Tier must be "basic" or "pro"' }),
  }),
});

export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * GET /subscriptions/me — Retorna a assinatura atual do usuário autenticado.
   */
  async getMySubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const subscription = await this.subscriptionsService.getMySubscription(userId);
      sendSuccess(res, subscription);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /subscriptions/upgrade — Faz upgrade do plano para `basic` ou `pro`.
   * Retorna 409 se o usuário já está no tier solicitado.
   */
  async upgrade(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { tier } = parseBody(upgradePlanSchema, req);
      const subscription = await this.subscriptionsService.upgradePlan(userId, tier);
      sendSuccessWithMessage(res, subscription, `Upgraded to ${tier} plan`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /subscriptions/cancel — Cancela a assinatura do usuário autenticado.
   * Retorna 404 se não houver assinatura ativa.
   */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const subscription = await this.subscriptionsService.cancelSubscription(userId);
      sendSuccessWithMessage(res, subscription, 'Subscription cancelled');
    } catch (error) {
      next(error);
    }
  }
}
