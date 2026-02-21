import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../lib/errors';
import type { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/schema', () => ({ apiKeys: {} }));

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let repoMock: ApiKeysRepository;

  const mockApiKey = {
    id: 'key-uuid-123',
    userId: 'user-uuid-456',
    label: 'My API Key',
    keyHash: 'sha256-hash-of-token',
    lastUsedAt: null,
    isRevoked: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repoMock = {
      create: vi.fn().mockResolvedValue(mockApiKey),
      findByUserId: vi.fn().mockResolvedValue([
        {
          id: mockApiKey.id,
          userId: mockApiKey.userId,
          label: mockApiKey.label,
          lastUsedAt: mockApiKey.lastUsedAt,
          isRevoked: mockApiKey.isRevoked,
          createdAt: mockApiKey.createdAt,
        },
      ]),
      findByHash: vi.fn().mockResolvedValue(mockApiKey),
      revoke: vi.fn().mockResolvedValue({ ...mockApiKey, isRevoked: true }),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    } as unknown as ApiKeysRepository;

    service = new ApiKeysService(repoMock);
  });

  describe('createKey()', () => {
    it('should generate a token with vxa_ prefix and 64 hex chars', async () => {
      const result = await service.createKey('user-uuid-456', 'My API Key');

      expect(result.rawToken).toMatch(/^vxa_[0-9a-f]{64}$/);
    });

    it('should save SHA-256 hash to DB, not the raw token', async () => {
      const result = await service.createKey('user-uuid-456', 'My API Key');

      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-456',
          label: 'My API Key',
          keyHash: expect.not.stringContaining('vxa_'), // hash should not be the raw token
        }),
      );

      // raw token should NOT be in the keyHash stored
      const createCall = vi.mocked(repoMock.create).mock.calls[0][0];
      expect(createCall.keyHash).not.toBe(result.rawToken);
    });

    it('should return rawToken only once during creation', async () => {
      const result = await service.createKey('user-uuid-456', 'My API Key');

      expect(result.rawToken).toBeDefined();
      expect(result.rawToken).toMatch(/^vxa_/);

      // rawToken should not be stored in the key record from DB
      expect(result.id).toBe(mockApiKey.id);
    });
  });

  describe('listKeys()', () => {
    it('should return keys for the user without exposing keyHash', async () => {
      const result = await service.listKeys('user-uuid-456');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('keyHash');
      expect(result[0].id).toBe(mockApiKey.id);
      expect(result[0].label).toBe(mockApiKey.label);
    });
  });

  describe('revokeKey()', () => {
    it('should revoke a key belonging to the user', async () => {
      const result = await service.revokeKey('key-uuid-123', 'user-uuid-456');

      expect(repoMock.revoke).toHaveBeenCalledWith('key-uuid-123', 'user-uuid-456');
      expect(result.isRevoked).toBe(true);
    });

    it('should throw ForbiddenError if key does not belong to user (revoke returns undefined)', async () => {
      vi.mocked(repoMock.revoke).mockResolvedValue(undefined);

      await expect(service.revokeKey('key-uuid-123', 'other-user')).rejects.toThrow(ForbiddenError);
    });
  });
});
