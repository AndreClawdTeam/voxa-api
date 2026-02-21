import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../lib/errors';
import type { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/schema', () => ({}));

const mockUser = {
  id: 'user-uuid-1',
  name: 'John Doe',
  email: 'john@example.com',
  passwordHash: 'hashed-password',
  role: 'customer' as const,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockSubscription = {
  id: 'sub-uuid-1',
  userId: 'user-uuid-1',
  tier: 'basic' as const,
  status: 'active' as const,
  trialEndsAt: null,
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-02-01'),
  cancelledAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockTranscription = {
  id: 'trans-uuid-1',
  userId: 'user-uuid-1',
  apiKeyId: 'key-uuid-1',
  status: 'completed' as const,
  audioFilename: 'test.mp3',
  audioSizeBytes: 1024,
  audioDurationSeconds: 60,
  audioFormat: 'audio/mpeg',
  transcribedText: 'Hello world',
  detectedLanguage: 'en',
  languageConfidence: 0.98,
  processingTimeMs: 1500,
  errorMessage: null,
  createdAt: new Date('2026-01-15'),
  completedAt: new Date('2026-01-15'),
};

describe('DashboardService', () => {
  let service: DashboardService;
  let repoMock: DashboardRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    repoMock = {
      getUsageSummary: vi.fn().mockResolvedValue({
        totalTranscriptions: 10,
        totalSeconds: 600,
        monthTranscriptions: 3,
        monthSeconds: 180,
        subscription: mockSubscription,
      }),
      getTranscriptionHistory: vi.fn().mockResolvedValue({
        data: [mockTranscription],
        total: 1,
      }),
      getProfile: vi.fn().mockResolvedValue({ user: mockUser, subscription: mockSubscription }),
      updateProfile: vi.fn().mockResolvedValue({ ...mockUser, name: 'Jane Doe' }),
      findUserById: vi.fn().mockResolvedValue(mockUser),
    } as unknown as DashboardRepository;

    service = new DashboardService(repoMock);
  });

  describe('getUsageSummary()', () => {
    it('should return total transcription count', async () => {
      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.totalTranscriptions).toBe(10);
    });

    it('should return total minutes transcribed (converted from seconds)', async () => {
      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.totalMinutes).toBeCloseTo(10); // 600s = 10min
    });

    it('should return monthly transcription count', async () => {
      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.monthTranscriptions).toBe(3);
    });

    it('should return monthly minutes transcribed', async () => {
      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.monthMinutes).toBeCloseTo(3); // 180s = 3min
    });

    it('should return current subscription tier', async () => {
      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.tier).toBe('basic');
    });

    it('should return current subscription status', async () => {
      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.status).toBe('active');
    });

    it('should include trialEndsAt when on trial subscription', async () => {
      const trialSub = {
        ...mockSubscription,
        tier: 'trial' as const,
        status: 'trial' as const,
        trialEndsAt: new Date('2026-03-01'),
      };
      vi.mocked(repoMock.getUsageSummary).mockResolvedValue({
        totalTranscriptions: 0,
        totalSeconds: 0,
        monthTranscriptions: 0,
        monthSeconds: 0,
        subscription: trialSub,
      });

      const result = await service.getUsageSummary('user-uuid-1');

      expect(result.trialEndsAt).toEqual(new Date('2026-03-01'));
    });

    it('should call repository with userId', async () => {
      await service.getUsageSummary('user-uuid-1');

      expect(repoMock.getUsageSummary).toHaveBeenCalledWith('user-uuid-1');
    });
  });

  describe('getTranscriptionHistory()', () => {
    it('should return paginated list of transcriptions', async () => {
      const result = await service.getTranscriptionHistory('user-uuid-1', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('trans-uuid-1');
    });

    it('should return total count', async () => {
      const result = await service.getTranscriptionHistory('user-uuid-1', 1, 20);

      expect(result.total).toBe(1);
    });

    it('should return current page number', async () => {
      const result = await service.getTranscriptionHistory('user-uuid-1', 2, 20);

      expect(result.page).toBe(2);
    });

    it('should calculate totalPages correctly', async () => {
      vi.mocked(repoMock.getTranscriptionHistory).mockResolvedValue({
        data: Array(20).fill(mockTranscription),
        total: 45,
      });

      const result = await service.getTranscriptionHistory('user-uuid-1', 1, 20);

      expect(result.totalPages).toBe(3); // ceil(45/20) = 3
    });

    it('should call repository with correct pagination params', async () => {
      await service.getTranscriptionHistory('user-uuid-1', 2, 10);

      expect(repoMock.getTranscriptionHistory).toHaveBeenCalledWith('user-uuid-1', {
        page: 2,
        limit: 10,
      });
    });
  });

  describe('getProfile()', () => {
    it('should return user id', async () => {
      const result = await service.getProfile('user-uuid-1');

      expect(result.id).toBe('user-uuid-1');
    });

    it('should return user name and email', async () => {
      const result = await service.getProfile('user-uuid-1');

      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should NOT expose passwordHash', async () => {
      const result = await service.getProfile('user-uuid-1');

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should return user role', async () => {
      const result = await service.getProfile('user-uuid-1');

      expect(result.role).toBe('customer');
    });

    it('should return subscription data', async () => {
      const result = await service.getProfile('user-uuid-1');

      expect(result.subscription).toBeDefined();
      expect(result.subscription?.tier).toBe('basic');
    });

    it('should return createdAt', async () => {
      const result = await service.getProfile('user-uuid-1');

      expect(result.createdAt).toBeDefined();
    });
  });

  describe('updateProfile()', () => {
    it('should update user name', async () => {
      const result = await service.updateProfile('user-uuid-1', { name: 'Jane Doe' });

      expect(result.name).toBe('Jane Doe');
    });

    it('should call repository updateProfile with userId and data', async () => {
      await service.updateProfile('user-uuid-1', { name: 'Jane Doe' });

      expect(repoMock.updateProfile).toHaveBeenCalledWith('user-uuid-1', { name: 'Jane Doe' });
    });

    it('should NOT expose passwordHash in response', async () => {
      const result = await service.updateProfile('user-uuid-1', { name: 'Jane Doe' });

      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw ValidationError if neither name nor email is provided', async () => {
      await expect(service.updateProfile('user-uuid-1', {})).rejects.toThrow(ValidationError);
    });

    it('should allow updating email only', async () => {
      vi.mocked(repoMock.updateProfile).mockResolvedValue({
        ...mockUser,
        email: 'newemail@example.com',
      });

      const result = await service.updateProfile('user-uuid-1', {
        email: 'newemail@example.com',
      });

      expect(result.email).toBe('newemail@example.com');
    });
  });
});
