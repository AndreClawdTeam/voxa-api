import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { ConflictError, UnauthorizedError } from '../../lib/errors';
import {
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import type { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import type { AuthRepository } from './auth.repository';
import type { LoginDto, RegisterDto } from './auth.schema';

export class AuthService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly subscriptionsRepo: SubscriptionsRepository,
  ) {}

  /**
   * Registra um novo usuário e cria automaticamente uma assinatura trial.
   *
   * @param data - Dados de cadastro (nome, email, senha em plaintext)
   * @returns Perfil público do usuário + tokens de acesso e refresh
   * @throws {ConflictError} Se o email já estiver cadastrado
   */
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

    await this.subscriptionsRepo.create({
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

  /**
   * Autentica o usuário com email e senha, retornando novos tokens JWT.
   *
   * @param data - Credenciais de login (email e senha em plaintext)
   * @returns Par de tokens `{ accessToken, refreshToken }`
   * @throws {UnauthorizedError} Se as credenciais estiverem incorretas
   */
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

  /**
   * Renova o access token usando um refresh token válido (não expirado e não revogado).
   * Implementa token rotation: o refresh token atual é revogado e um novo é emitido,
   * prevenindo o uso indefinido de tokens roubados.
   *
   * @param token - Refresh token JWT
   * @returns Novo par `{ accessToken, refreshToken }`
   * @throws {UnauthorizedError} Se o token for inválido, expirado ou revogado
   */
  async refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    // verifyRefreshToken validates iss/aud, expiry, AND checks the jti blacklist
    const payload = verifyRefreshToken(token);

    const user = await this.authRepo.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Revogar o refresh token atual (rotation — previne reutilização após renovação)
    const exp = payload.exp ? payload.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000;
    revokeRefreshToken(payload.jti, exp);

    // Emitir novos tokens
    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id });

    return { accessToken, refreshToken };
  }

  /**
   * Invalida o refresh token no servidor (blacklist por jti) e encerra a sessão.
   *
   * O access token permanece válido até expirar (curto prazo). O cliente deve descartá-lo.
   *
   * @param _userId - ID do usuário fazendo logout (para auditoria futura)
   * @param refreshToken - Refresh token a invalidar (opcional; sem ele apenas o cliente descarta)
   * @returns `{ success: true }`
   */
  async logout(_userId: string, refreshToken?: string) {
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
