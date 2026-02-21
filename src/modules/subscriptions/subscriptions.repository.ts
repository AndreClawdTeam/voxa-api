import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { type NewSubscription, type Subscription, subscriptions } from '../../db/schema';

export class SubscriptionsRepository {
  async findByUserId(userId: string): Promise<Subscription | undefined> {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return sub;
  }

  async create(data: NewSubscription): Promise<Subscription> {
    const [sub] = await db.insert(subscriptions).values(data).returning();
    return sub;
  }

  async updateTier(
    userId: string,
    tier: 'trial' | 'basic' | 'pro',
    status: 'active' | 'trial' | 'suspended' | 'cancelled',
  ): Promise<Subscription> {
    const [sub] = await db
      .update(subscriptions)
      .set({ tier, status, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return sub;
  }

  async cancel(userId: string): Promise<Subscription> {
    const [sub] = await db
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return sub;
  }

  async isActive(userId: string): Promise<boolean> {
    const sub = await this.findByUserId(userId);
    if (!sub) return false;
    if (sub.status === 'active') return true;
    if (sub.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt > new Date()) return true;
    return false;
  }
}
