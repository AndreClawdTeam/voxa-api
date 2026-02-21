import { ForbiddenError, NotFoundError } from '../../lib/errors';
import type {
  AdminRepository,
  AdminStats,
  UserDetails,
  UserWithSubscription,
} from './admin.repository';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PaginationQuery {
  page: number;
  limit: number;
  search?: string;
}

export interface UpdateSubscriptionDto {
  tier?: 'trial' | 'basic' | 'pro';
  status?: 'active' | 'trial' | 'suspended' | 'cancelled';
}

export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  /**
   * Verifica se o usuário com o ID fornecido possui role `admin`.
   * Lança `ForbiddenError` se não for admin.
   *
   * @param adminId - ID do usuário que deve ser admin
   * @throws {ForbiddenError} Se o usuário não for admin ou não existir
   */
  private async assertAdmin(adminId: string): Promise<void> {
    const user = await this.repo.findAdminById(adminId);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
  }

  /**
   * Lista todos os usuários do sistema com dados de assinatura, paginado.
   * Suporta filtro por nome ou email via `search`.
   *
   * @param adminId - ID do admin executando a operação
   * @param query - Parâmetros de paginação e filtro
   * @returns Lista paginada de usuários com assinatura
   * @throws {ForbiddenError} Se o `adminId` não for admin
   */
  async listUsers(
    adminId: string,
    query: PaginationQuery,
  ): Promise<PaginatedResult<UserWithSubscription>> {
    await this.assertAdmin(adminId);

    const [data, total] = await Promise.all([
      this.repo.listUsers({ page: query.page, limit: query.limit, search: query.search }),
      this.repo.countUsers(query.search),
    ]);

    return {
      data,
      total,
      page: query.page,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Retorna detalhes completos de um usuário: perfil, assinatura e transcrições recentes.
   *
   * @param adminId - ID do admin executando a operação
   * @param userId - ID do usuário a consultar
   * @returns Detalhes completos do usuário
   * @throws {ForbiddenError} Se o `adminId` não for admin
   * @throws {NotFoundError} Se o usuário não for encontrado
   */
  async getUserDetails(adminId: string, userId: string): Promise<UserDetails> {
    await this.assertAdmin(adminId);

    const details = await this.repo.getUserWithDetails(userId);
    if (!details) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    return details;
  }

  /**
   * Atualiza o tier e/ou status da assinatura de qualquer usuário.
   * Registra a ação no audit log automaticamente.
   *
   * @param adminId - ID do admin executando a operação
   * @param userId - ID do usuário alvo
   * @param data - Campos a atualizar (`tier` e/ou `status`)
   * @returns Assinatura atualizada
   * @throws {ForbiddenError} Se o `adminId` não for admin
   */
  async updateSubscription(adminId: string, userId: string, data: UpdateSubscriptionDto) {
    await this.assertAdmin(adminId);

    const updated = await this.repo.updateUserSubscription(userId, data, adminId);
    return updated;
  }

  /**
   * Retorna o log de auditoria das ações administrativas, paginado.
   *
   * @param adminId - ID do admin executando a operação
   * @param query - Parâmetros de paginação
   * @returns Lista paginada de entradas do audit log
   * @throws {ForbiddenError} Se o `adminId` não for admin
   */
  async getAuditLog(
    adminId: string,
    query: { page: number; limit: number },
  ): Promise<PaginatedResult<Awaited<ReturnType<AdminRepository['getAuditLogs']>>[number]>> {
    await this.assertAdmin(adminId);

    const [data, total] = await Promise.all([
      this.repo.getAuditLogs({ page: query.page, limit: query.limit }),
      this.repo.countAuditLogs(),
    ]);

    return {
      data,
      total,
      page: query.page,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /**
   * Retorna estatísticas globais do sistema: total de usuários, transcrições
   * e distribuição de assinaturas por tier.
   *
   * @param adminId - ID do admin executando a operação
   * @returns Estatísticas do sistema (`AdminStats`)
   * @throws {ForbiddenError} Se o `adminId` não for admin
   */
  async getDashboardStats(adminId: string): Promise<AdminStats> {
    await this.assertAdmin(adminId);
    return this.repo.getStats();
  }
}
