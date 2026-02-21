import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, UnauthorizedError } from '../../lib/errors';
import type { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

// Mock the db module to avoid real DB connections in unit tests
vi.mock('../../db', () => ({
  db: {},
}));

vi.mock('../../db/schema', () => ({
  users: {},
  subscriptions: {},
}));

vi.mock('../../lib/jwt', () => ({
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  signRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
  verifyToken: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
    compare: vi.fn(),
  },
}));

describe('AuthService', () => {
  let service: AuthService;
  let repoMock: AuthRepository;

  const mockUser = {
    id: 'user-uuid-123',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: 'customer' as const,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      createSubscription: vi.fn(),
    } as unknown as AuthRepository;
    service = new AuthService(repoMock);
  });

  // ─── register() ───────────────────────────────────────────────────────────

  describe('register()', () => {
    const registerData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    };

    it('should create user with hashed password', async () => {
      vi.mocked(repoMock.findByEmail).mockResolvedValue(undefined);
      vi.mocked(repoMock.create).mockResolvedValue(mockUser);
      vi.mocked(repoMock.createSubscription).mockResolvedValue({
        id: 'sub-uuid',
        userId: mockUser.id,
        tier: 'trial',
        status: 'trial',
        trialEndsAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.register(registerData);

      expect(repoMock.findByEmail).toHaveBeenCalledWith(registerData.email);
      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: registerData.name,
          email: registerData.email,
          passwordHash: 'hashed-password',
          role: 'customer',
        }),
      );
      expect(result).toMatchObject({
        user: expect.objectContaining({ email: mockUser.email }),
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should throw ConflictError when email already exists', async () => {
      vi.mocked(repoMock.findByEmail).mockResolvedValue(mockUser);

      await expect(service.register(registerData)).rejects.toThrow(ConflictError);
      await expect(service.register(registerData)).rejects.toThrow('Email already registered');
      expect(repoMock.create).not.toHaveBeenCalled();
    });

    it('should create trial subscription on register', async () => {
      vi.mocked(repoMock.findByEmail).mockResolvedValue(undefined);
      vi.mocked(repoMock.create).mockResolvedValue(mockUser);
      vi.mocked(repoMock.createSubscription).mockResolvedValue({
        id: 'sub-uuid',
        userId: mockUser.id,
        tier: 'trial',
        status: 'trial',
        trialEndsAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.register(registerData);

      expect(repoMock.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          tier: 'trial',
          status: 'trial',
        }),
      );
    });
  });

  // ─── login() ──────────────────────────────────────────────────────────────

  describe('login()', () => {
    const loginData = { email: 'test@example.com', password: 'password123' };

    it('should return access and refresh tokens on valid credentials', async () => {
      const bcrypt = await import('bcryptjs');
      vi.mocked(repoMock.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.default.compare).mockResolvedValue(true as never);

      const result = await service.login(loginData);

      expect(result).toMatchObject({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should throw UnauthorizedError when user not found', async () => {
      vi.mocked(repoMock.findByEmail).mockResolvedValue(undefined);

      await expect(service.login(loginData)).rejects.toThrow(UnauthorizedError);
      await expect(service.login(loginData)).rejects.toThrow('Invalid credentials');
    });

    it('should throw UnauthorizedError when password is wrong', async () => {
      const bcrypt = await import('bcryptjs');
      vi.mocked(repoMock.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(bcrypt.default.compare).mockResolvedValue(false as never);

      await expect(service.login(loginData)).rejects.toThrow(UnauthorizedError);
      await expect(service.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  // ─── refreshToken() ───────────────────────────────────────────────────────

  describe('refreshToken()', () => {
    it('should return new access token for valid refresh token', async () => {
      const jwt = await import('../../lib/jwt');
      vi.mocked(jwt.verifyToken).mockReturnValue({ userId: mockUser.id } as never);
      vi.mocked(repoMock.findById).mockResolvedValue(mockUser);

      const result = await service.refreshToken('valid-refresh-token');

      expect(jwt.verifyToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(result).toMatchObject({ accessToken: 'mock-access-token' });
    });

    it('should throw UnauthorizedError for invalid/expired token', async () => {
      const jwt = await import('../../lib/jwt');
      vi.mocked(jwt.verifyToken).mockImplementation(() => {
        throw new UnauthorizedError('Invalid or expired token');
      });

      await expect(service.refreshToken('invalid-token')).rejects.toThrow(UnauthorizedError);
    });
  });
});
