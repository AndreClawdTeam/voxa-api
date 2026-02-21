import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { ConflictError, UnauthorizedError } from '../../lib/errors';
import {
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import type { AuthRepository } from './auth.repository';
import type { LoginDto, RegisterDto } from './auth.schema';

export class AuthService {
  constructor(private readonly authRepo: AuthRepository) {}

  async register(data: RegisterDto) {
    const existing = await this.authRepo.findByEmail(data.email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.authRepo.create({
      name: data.name,
      email: data.email,
      passwordHash,
      role: 'customer',
    });

    // Automatically create trial subscription
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + env.TRIAL_DURATION_DAYS);

    await this.authRepo.createSubscription({
      userId: user.id,
      tier: 'trial',
      status: 'trial',
      trialEndsAt,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
    });

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(data: LoginDto) {
    const user = await this.authRepo.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id });

    return { accessToken, refreshToken };
  }

  async refreshToken(token: string) {
    // verifyRefreshToken validates iss/aud, expiry, AND checks the jti blacklist
    const payload = verifyRefreshToken(token);
    const userId = payload.userId as string;

    const user = await this.authRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    return { accessToken };
  }

  async logout(_userId: string, refreshToken?: string) {
    // Blacklist the refresh token's jti so it cannot be reused after logout.
    // Access tokens are short-lived (15m) and remain valid until they expire —
    // clients must discard them on logout.
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const exp = payload.exp ? payload.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;
        revokeRefreshToken(payload.jti, exp);
      } catch {
        // If the token is already invalid/expired, nothing to revoke
      }
    }
    return { success: true };
  }
}
