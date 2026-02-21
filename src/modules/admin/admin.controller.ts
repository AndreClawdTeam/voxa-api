import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../lib/errors';
import { requireUser, sendPaginated, sendSuccess } from '../../lib/http';
import {
  paginationWithSearchSchema,
  parseBody,
  parseParams,
  parseQuery,
} from '../../lib/validation';
import type { AdminService } from './admin.service';

const userIdParamSchema = z.object({ id: z.string().uuid('Invalid user ID') });

const updateSubscriptionSchema = z.object({
  tier: z.enum(['trial', 'basic', 'pro']).optional(),
  status: z.enum(['active', 'trial', 'suspended', 'cancelled']).optional(),
});

export class AdminController {
  constructor(private readonly service: AdminService) {}

  /**
   * GET /admin/users — Lista paginada de todos os usuários (com dados de assinatura).
   * Query params: `page`, `limit`, `search` (opcional — filtra por nome ou email).
   * Requer role `admin`.
   */
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { page, limit, search } = parseQuery(paginationWithSearchSchema, req);
      const result = await this.service.listUsers(userId, { page, limit, search });

      sendPaginated(res, result.data, {
        page: result.page,
        limit,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/users/:id — Detalhes completos de um usuário (subscription + transcrições recentes).
   * Requer role `admin`.
   */
  async getUserDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { id } = parseParams(userIdParamSchema, req);
      const details = await this.service.getUserDetails(userId, id);
      sendSuccess(res, details);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/users/:id/subscription — Atualiza tier e/ou status da assinatura de um usuário.
   * Ao menos um campo (`tier` ou `status`) deve ser informado.
   * Requer role `admin`.
   */
  async updateSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { id } = parseParams(userIdParamSchema, req);
      const data = parseBody(updateSubscriptionSchema, req);

      if (!data.tier && !data.status) {
        throw new ValidationError('At least one field (tier or status) must be provided');
      }

      const updated = await this.service.updateSubscription(userId, id, data);
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/audit-log — Log de auditoria paginado (ações administrativas).
   * Query params: `page`, `limit`.
   * Requer role `admin`.
   */
  async getAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { page, limit } = parseQuery(paginationWithSearchSchema, req);
      const result = await this.service.getAuditLog(userId, { page, limit });

      sendPaginated(res, result.data, {
        page: result.page,
        limit,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/stats — Estatísticas globais do sistema (totais de usuários, transcrições e planos).
   * Requer role `admin`.
   */
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const stats = await this.service.getDashboardStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }
}
