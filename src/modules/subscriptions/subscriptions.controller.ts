import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../lib/errors';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { SubscriptionsService } from './subscriptions.service';

const upgradePlanSchema = z.object({
  tier: z.enum(['basic', 'pro'], {
    errorMap: () => ({ message: 'Tier must be "basic" or "pro"' }),
  }),
});

export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async getMySubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const subscription = await this.subscriptionsService.getMySubscription(authReq.user.userId);

      return res.status(200).json({ data: subscription });
    } catch (error) {
      return next(error);
    }
  }

  async upgrade(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = upgradePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Validation failed');
      }

      const subscription = await this.subscriptionsService.upgradePlan(
        authReq.user.userId,
        parsed.data.tier,
      );

      return res
        .status(200)
        .json({ data: subscription, message: `Upgraded to ${parsed.data.tier} plan` });
    } catch (error) {
      return next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const subscription = await this.subscriptionsService.cancelSubscription(authReq.user.userId);

      return res.status(200).json({ data: subscription, message: 'Subscription cancelled' });
    } catch (error) {
      return next(error);
    }
  }
}
