import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { ConflictError, UnauthorizedError } from '../../lib/errors';
import { signAccessToken, signRefreshToken, verifyToken } from '../../lib/jwt';
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
    const payload = verifyToken(token);
    const userId = payload.userId as string;

    const user = await this.authRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    return { accessToken };
  }

  async logout(_userId: string) {
    // With stateless JWT, logout is handled client-side by discarding the token.
    // In a full implementation, we'd maintain a token blacklist or use refresh token rotation.
    return { success: true };
  }
}
