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

  private async assertAdmin(adminId: string): Promise<void> {
    const user = await this.repo.findAdminById(adminId);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
  }

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

  async getUserDetails(adminId: string, userId: string): Promise<UserDetails> {
    await this.assertAdmin(adminId);

    const details = await this.repo.getUserWithDetails(userId);
    if (!details) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    return details;
  }

  async updateSubscription(adminId: string, userId: string, data: UpdateSubscriptionDto) {
    await this.assertAdmin(adminId);

    const updated = await this.repo.updateUserSubscription(userId, data, adminId);
    return updated;
  }

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

  async getDashboardStats(adminId: string): Promise<AdminStats> {
    await this.assertAdmin(adminId);
    return this.repo.getStats();
  }
}
