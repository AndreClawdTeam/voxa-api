import type { Transcription } from '../../db/schema';
import { ValidationError } from '../../lib/errors';
import type { DashboardRepository } from './dashboard.repository';

export interface UsageSummary {
  totalTranscriptions: number;
  totalMinutes: number;
  monthTranscriptions: number;
  monthMinutes: number;
  tier: 'trial' | 'basic' | 'pro' | null;
  status: string | null;
  trialEndsAt?: Date | null;
}

export interface TranscriptionHistoryResult {
  data: Transcription[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  subscription: {
    id: string;
    tier: string;
    status: string;
    trialEndsAt?: Date | null;
  } | null;
  createdAt: Date;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileDto {
  name?: string;
  email?: string;
}

export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  /**
   * Retorna o resumo de uso de transcrição do usuário (total e do mês atual).
   * Converte segundos em minutos. Inclui dados da assinatura atual.
   *
   * @param userId - ID do usuário
   * @returns Resumo de uso com totais e dados da assinatura
   */
  async getUsageSummary(userId: string): Promise<UsageSummary> {
    const data = await this.repo.getUsageSummary(userId);

    const totalMinutes = (data.totalSeconds ?? 0) / 60;
    const monthMinutes = (data.monthSeconds ?? 0) / 60;

    return {
      totalTranscriptions: data.totalTranscriptions,
      totalMinutes,
      monthTranscriptions: data.monthTranscriptions,
      monthMinutes,
      tier: data.subscription?.tier ?? null,
      status: data.subscription?.status ?? null,
      trialEndsAt: data.subscription?.trialEndsAt,
    };
  }

  /**
   * Retorna o histórico paginado de transcrições do usuário.
   * Calcula o total de páginas com base no total de registros.
   *
   * @param userId - ID do usuário
   * @param page - Número da página (começa em 1)
   * @param limit - Quantidade de itens por página
   * @returns Dados paginados com `data`, `total`, `page` e `totalPages`
   */
  async getTranscriptionHistory(
    userId: string,
    page: number,
    limit: number,
  ): Promise<TranscriptionHistoryResult> {
    const { data, total } = await this.repo.getTranscriptionHistory(userId, { page, limit });

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retorna o perfil do usuário autenticado, excluindo o `passwordHash`.
   * Inclui dados da assinatura atual.
   *
   * @param userId - ID do usuário
   * @returns Perfil público com dados de assinatura
   * @throws {Error} Se o usuário não for encontrado (situação inesperada)
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const result = await this.repo.getProfile(userId);

    if (!result) {
      throw new Error('User not found');
    }

    const { user, subscription } = result;

    // Exclude passwordHash
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      subscription: subscription
        ? {
            id: subscription.id,
            tier: subscription.tier,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
          }
        : null,
      createdAt: user.createdAt,
    };
  }

  /**
   * Atualiza nome e/ou email do usuário autenticado.
   * O `passwordHash` é excluído da resposta.
   *
   * @param userId - ID do usuário
   * @param data - Campos a atualizar (ao menos um obrigatório: `name` ou `email`)
   * @returns Perfil atualizado sem `passwordHash`
   * @throws {ValidationError} Se nenhum campo for informado
   * @throws {Error} Se o usuário não for encontrado
   */
  async updateProfile(userId: string, data: UpdateProfileDto): Promise<SafeUser> {
    if (!data.name && !data.email) {
      throw new ValidationError('At least one field (name or email) must be provided');
    }

    const updated = await this.repo.updateProfile(userId, data);

    if (!updated) {
      throw new Error('User not found');
    }

    // Omit passwordHash from return
    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }
}
