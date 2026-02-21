import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../db/schema';
import { ForbiddenError } from '../../lib/errors';
import type {
  AdminRepository,
  AuditLog,
  UserDetails,
  UserWithSubscription,
} from './admin.repository';
import { AdminService } from './admin.service';

// Mock DB to avoid real connections
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/schema', () => ({
  users: {},
  subscriptions: {},
  transcriptions: {},
  auditLogs: {},
}));

/** Helper: creates a minimal partial User mock. Tests only care about id/role. */
function mockUser(id: string, role: 'admin' | 'customer'): User {
  return { id, role } as unknown as User;
}

describe('AdminService', () => {
  let service: AdminService;
  let repoMock: AdminRepository;

  const adminUser = { userId: 'admin-uuid', role: 'admin' };
  const customerUser = { userId: 'customer-uuid', role: 'customer' };

  const mockUsers: UserWithSubscription[] = [
    {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'customer',
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      subscription: { id: 'sub-1', tier: 'basic', status: 'active', trialEndsAt: null },
    },
    {
      id: 'user-2',
      name: 'Bob',
      email: 'bob@example.com',
      role: 'customer',
      isActive: true,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
      subscription: { id: 'sub-2', tier: 'trial', status: 'trial', trialEndsAt: null },
    },
  ];

  const mockUserDetails: UserDetails = {
    id: 'user-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'customer',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    subscription: {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'basic',
      status: 'active',
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelledAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
    recentTranscriptions: [
      {
        id: 'tx-1',
        userId: 'user-1',
        apiKeyId: 'key-1',
        status: 'completed',
        audioFilename: 'audio.mp3',
        audioSizeBytes: 1024,
        audioFormat: 'audio/mpeg',
        transcribedText: 'Hello world',
        detectedLanguage: 'en',
        languageConfidence: 0.99,
        audioDurationSeconds: 5,
        processingTimeMs: 1000,
        errorMessage: null,
        completedAt: new Date('2026-01-15'),
        createdAt: new Date('2026-01-15'),
        updatedAt: new Date('2026-01-15'),
      },
    ],
  };

  const mockAuditLogs: AuditLog[] = [
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
      vi.mocked(repoMock.findAdminById).mockResolvedValue(mockUser(adminUser.userId, 'admin'));
      vi.mocked(repoMock.listUsers).mockResolvedValue(mockUsers);
      vi.mocked(repoMock.countUsers).mockResolvedValue(2);

      const result = await service.listUsers(adminUser.userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.data[0]).toHaveProperty('subscription');
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(
        mockUser(customerUser.userId, 'customer'),
      );

      await expect(service.listUsers(customerUser.userId, { page: 1, limit: 20 })).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  // ─── getUserDetails() ─────────────────────────────────────────────────────

  describe('getUserDetails()', () => {
    it('should return user with transcription history and subscription', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(mockUser(adminUser.userId, 'admin'));
      vi.mocked(repoMock.getUserWithDetails).mockResolvedValue(mockUserDetails);

      const result = await service.getUserDetails(adminUser.userId, 'user-1');

      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('recentTranscriptions');
      expect(repoMock.getUserWithDetails).toHaveBeenCalledWith('user-1');
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(
        mockUser(customerUser.userId, 'customer'),
      );

      await expect(service.getUserDetails(customerUser.userId, 'user-1')).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  // ─── updateSubscription() ─────────────────────────────────────────────────

  describe('updateSubscription()', () => {
    const updateData = { tier: 'pro' as const, status: 'active' as const };

    it('should allow admin to update tier and status of any user', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(mockUser(adminUser.userId, 'admin'));
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
      });

      const result = await service.updateSubscription(adminUser.userId, 'user-1', updateData);

      expect(result).toHaveProperty('tier', 'pro');
      expect(repoMock.updateUserSubscription).toHaveBeenCalledWith(
        'user-1',
        updateData,
        adminUser.userId,
      );
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(
        mockUser(customerUser.userId, 'customer'),
      );

      await expect(
        service.updateSubscription(customerUser.userId, 'user-1', updateData),
      ).rejects.toThrow(ForbiddenError);
      expect(repoMock.updateUserSubscription).not.toHaveBeenCalled();
    });
  });

  // ─── getAuditLog() ────────────────────────────────────────────────────────

  describe('getAuditLog()', () => {
    it('should return paginated audit logs', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(mockUser(adminUser.userId, 'admin'));
      vi.mocked(repoMock.getAuditLogs).mockResolvedValue(mockAuditLogs);
      vi.mocked(repoMock.countAuditLogs).mockResolvedValue(1);

      const result = await service.getAuditLog(adminUser.userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0]).toHaveProperty('action', 'UPDATE_SUBSCRIPTION');
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(
        mockUser(customerUser.userId, 'customer'),
      );

      await expect(
        service.getAuditLog(customerUser.userId, { page: 1, limit: 20 }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // ─── getDashboardStats() ──────────────────────────────────────────────────

  describe('getDashboardStats()', () => {
    it('should return system totals for admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(mockUser(adminUser.userId, 'admin'));
      vi.mocked(repoMock.getStats).mockResolvedValue(mockStats);

      const result = await service.getDashboardStats(adminUser.userId);

      expect(result).toHaveProperty('totalUsers', 42);
      expect(result).toHaveProperty('totalTranscriptions', 1337);
      expect(result.activeSubscriptions).toHaveProperty('pro', 12);
    });

    it('should throw ForbiddenError if caller is not admin', async () => {
      vi.mocked(repoMock.findAdminById).mockResolvedValue(
        mockUser(customerUser.userId, 'customer'),
      );

      await expect(service.getDashboardStats(customerUser.userId)).rejects.toThrow(ForbiddenError);
    });
  });
});
