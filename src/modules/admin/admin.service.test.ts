import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../lib/errors';
import type { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

// Mock DB to avoid real connections
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/schema', () => ({
  users: {},
  subscriptions: {},
  transcriptions: {},
  auditLogs: {},
}));

describe('AdminService', () => {
  let service: AdminService;
  let repoMock: AdminRepository;

  const adminUser = { userId: 'admin-uuid', role: 'admin' };
  const customerUser = { userId: 'customer-uuid', role: 'customer' };

  const mockUsers = [
    {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'customer' as const,
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      subscription: { tier: 'basic', status: 'active' },
    },
    {
      id: 'user-2',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'customer' as const,
      isActive: true,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
      subscription: { tier: 'trial', status: 'trial' },
    },
  ];

  const mockUserDetails = {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'customer' as const,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    subscription: {
      id: 'sub-1',
      tier: 'basic',
      status: 'active',
      trialEndsAt: null,
      createdAt: new Date('2026-01-01'),
    },
    recentTranscriptions: [
      {
        id: 'tx-1',
        status: 'completed',
        audioFilename: 'audio.mp3',
        createdAt: new Date('2026-01-15'),
      },
    ],
  };

  const mockAuditLogs = [
    {
      id: 'audit-1',
      adminId: 'admin-uuid',
      targetUserId: 'user-1',
      action: 'UPDATE_SUBSCRIPTION',
      details: '{"tier":"pro","status":"active"}',
      ipAddress: '127.0.0.1',
      createdAt: new Date('2026-01-10'),
    },
  ];

  const mockStats = {
    totalUsers: 42,
    totalTranscriptions: 1337,
    activeSubscriptions: { trial: 10, basic: 20, pro: 12 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock = {
      listUsers: vi.fn(),
      countUsers: vi.fn(),
      getUserWithDetails: vi.fn(),
      updateUserSubscription: vi.fn(),
      getAuditLogs: vi.fn(),
      countAuditLogs: vi.fn(),
      getStats: vi.fn(),
      findAdminById: vi.fn(),
    } as unknown as AdminRepository;
    service = new AdminService(repoMock);
  });

  // ─── listUsers() ──────────────────────────────────────────────────────────

  describe('listUsers()', () => {
    it('should return paginated list of users with subscription info', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: adminUser.userId,
        role: 'admin',
      } as any);
      vi.mocked(repoMock.listUsers).mockResolvedValue(mockUsers as any);
      vi.mocked(repoMock.countUsers).mockResolvedValue(2);

      const result = await service.listUsers(adminUser.userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0]).toHaveProperty('subscription');
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: customerUser.userId,
        role: 'customer',
      } as any);

      await expect(service.listUsers(customerUser.userId, { page: 1, limit: 20 })).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  // ─── getUserDetails() ─────────────────────────────────────────────────────

  describe('getUserDetails()', () => {
    it('should return user with transcription history and subscription', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: adminUser.userId,
        role: 'admin',
      } as any);
      vi.mocked(repoMock.getUserWithDetails).mockResolvedValue(mockUserDetails as any);

      const result = await service.getUserDetails(adminUser.userId, 'user-1');

      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('recentTranscriptions');
      expect(repoMock.getUserWithDetails).toHaveBeenCalledWith('user-1');
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: customerUser.userId,
        role: 'customer',
      } as any);

      await expect(service.getUserDetails(customerUser.userId, 'user-1')).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  // ─── updateSubscription() ─────────────────────────────────────────────────

  describe('updateSubscription()', () => {
    const updateData = { tier: 'pro' as const, status: 'active' as const };

    it('should allow admin to update tier and status of any user', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: adminUser.userId,
        role: 'admin',
      } as any);
      vi.mocked(repoMock.updateUserSubscription).mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        tier: 'pro',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelledAt: null,
      } as any);

      const result = await service.updateSubscription(adminUser.userId, 'user-1', updateData);

      expect(result).toHaveProperty('tier', 'pro');
      expect(repoMock.updateUserSubscription).toHaveBeenCalledWith(
        'user-1',
        updateData,
        adminUser.userId,
      );
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: customerUser.userId,
        role: 'customer',
      } as any);

      await expect(
        service.updateSubscription(customerUser.userId, 'user-1', updateData),
      ).rejects.toThrow(ForbiddenError);
      expect(repoMock.updateUserSubscription).not.toHaveBeenCalled();
    });
  });

  // ─── getAuditLog() ────────────────────────────────────────────────────────

  describe('getAuditLog()', () => {
    it('should return paginated audit logs', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: adminUser.userId,
        role: 'admin',
      } as any);
      vi.mocked(repoMock.getAuditLogs).mockResolvedValue(mockAuditLogs as any);
      vi.mocked(repoMock.countAuditLogs).mockResolvedValue(1);

      const result = await service.getAuditLog(adminUser.userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0]).toHaveProperty('action', 'UPDATE_SUBSCRIPTION');
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: customerUser.userId,
        role: 'customer',
      } as any);

      await expect(
        service.getAuditLog(customerUser.userId, { page: 1, limit: 20 }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // ─── getDashboardStats() ──────────────────────────────────────────────────

  describe('getDashboardStats()', () => {
    it('should return system totals for admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: adminUser.userId,
        role: 'admin',
      } as any);
      vi.mocked(repoMock.getStats).mockResolvedValue(mockStats);

      const result = await service.getDashboardStats(adminUser.userId);

      expect(result).toHaveProperty('totalUsers', 42);
      expect(result).toHaveProperty('totalTranscriptions', 1337);
      expect(result.activeSubscriptions).toHaveProperty('pro', 12);
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue({
        id: customerUser.userId,
        role: 'customer',
      } as any);

      await expect(service.getDashboardStats(customerUser.userId)).rejects.toThrow(ForbiddenError);
    });
  });
});
