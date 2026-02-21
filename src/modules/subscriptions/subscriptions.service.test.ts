import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../../lib/errors';
import type { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/schema', () => ({ subscriptions: {} }));

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repoMock: SubscriptionsRepository;

  const activeSubscription = {
    id: 'sub-uuid-123',
    userId: 'user-uuid-456',
    tier: 'basic' as const,
    status: 'active' as const,
    trialEndsAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const trialSubscription = {
    ...activeSubscription,
    tier: 'trial' as const,
    status: 'trial' as const,
    trialEndsAt: new Date(Date.now() + 86400000), // tomorrow
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repoMock = {
      findByUserId: vi.fn().mockResolvedValue(activeSubscription),
      create: vi.fn(),
      updateTier: vi
        .fn()
        .mockResolvedValue({ ...activeSubscription, tier: 'pro', status: 'active' }),
      cancel: vi.fn().mockResolvedValue({ ...activeSubscription, status: 'cancelled' }),
      isActive: vi.fn().mockResolvedValue(true),
    } as unknown as SubscriptionsRepository;

    service = new SubscriptionsService(repoMock);
  });

  describe('getMySubscription()', () => {
    it('should return the active subscription for a user', async () => {
      const result = await service.getMySubscription('user-uuid-456');

      expect(repoMock.findByUserId).toHaveBeenCalledWith('user-uuid-456');
      expect(result.id).toBe(activeSubscription.id);
      expect(result.tier).toBe('basic');
      expect(result.status).toBe('active');
    });

    it('should throw NotFoundError if user has no subscription', async () => {
      vi.mocked(repoMock.findByUserId).mockResolvedValue(undefined);

      await expect(service.getMySubscription('user-uuid-456')).rejects.toThrow(NotFoundError);
    });
  });

  describe('upgradePlan()', () => {
    it('should upgrade tier from trial to basic and set status to active', async () => {
      vi.mocked(repoMock.findByUserId).mockResolvedValue(trialSubscription);
      vi.mocked(repoMock.updateTier).mockResolvedValue({
        ...trialSubscription,
        tier: 'basic',
        status: 'active',
      });

      const result = await service.upgradePlan('user-uuid-456', 'basic');

      expect(repoMock.updateTier).toHaveBeenCalledWith('user-uuid-456', 'basic', 'active');
      expect(result.tier).toBe('basic');
      expect(result.status).toBe('active');
    });

    it('should upgrade tier from basic to pro', async () => {
      vi.mocked(repoMock.updateTier).mockResolvedValue({
        ...activeSubscription,
        tier: 'pro',
        status: 'active',
      });

      const result = await service.upgradePlan('user-uuid-456', 'pro');

      expect(repoMock.updateTier).toHaveBeenCalledWith('user-uuid-456', 'pro', 'active');
      expect(result.tier).toBe('pro');
    });

    it('should throw ConflictError if already on the requested tier', async () => {
      vi.mocked(repoMock.findByUserId).mockResolvedValue({
        ...activeSubscription,
        tier: 'pro',
      });

      await expect(service.upgradePlan('user-uuid-456', 'pro')).rejects.toThrow(ConflictError);
      expect(repoMock.updateTier).not.toHaveBeenCalled();
    });
  });

  describe('cancelSubscription()', () => {
    it('should cancel the subscription and set status to cancelled', async () => {
      const result = await service.cancelSubscription('user-uuid-456');

      expect(repoMock.cancel).toHaveBeenCalledWith('user-uuid-456');
      expect(result.status).toBe('cancelled');
    });

    it('should throw NotFoundError if user has no subscription', async () => {
      vi.mocked(repoMock.findByUserId).mockResolvedValue(undefined);

      await expect(service.cancelSubscription('user-uuid-456')).rejects.toThrow(NotFoundError);
    });
  });
});
