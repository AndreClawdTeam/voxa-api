import { ConflictError, NotFoundError } from '../../lib/errors';
import type { SubscriptionsRepository } from './subscriptions.repository';

export class SubscriptionsService {
  constructor(private readonly subscriptionsRepo: SubscriptionsRepository) {}

  async getMySubscription(userId: string) {
    const subscription = await this.subscriptionsRepo.findByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No subscription found for this user');
    }
    return subscription;
  }

  async upgradePlan(userId: string, newTier: 'basic' | 'pro') {
    const subscription = await this.subscriptionsRepo.findByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No subscription found for this user');
    }

    if (subscription.tier === newTier) {
      throw new ConflictError(`You are already on the ${newTier} plan`);
    }

    return this.subscriptionsRepo.updateTier(userId, newTier, 'active');
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.subscriptionsRepo.findByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No subscription found for this user');
    }

    return this.subscriptionsRepo.cancel(userId);
  }
}
