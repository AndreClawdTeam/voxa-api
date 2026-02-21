import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { requireUser, sendPaginated, sendSuccess } from '../../lib/http';
import { paginationSchema, parseBody, parseQuery } from '../../lib/validation';
import type { DashboardService } from './dashboard.service';

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /**
   * GET /dashboard/usage — Resumo de uso total e mensal do usuário autenticado.
   */
  async getUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const summary = await this.service.getUsageSummary(userId);
      sendSuccess(res, summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /dashboard/transcriptions — Histórico paginado de transcrições do usuário.
   * Query params: `page` (default 1), `limit` (default 20, max 100).
   */
  async getTranscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { page, limit } = parseQuery(paginationSchema, req);
      const result = await this.service.getTranscriptionHistory(userId, page, limit);

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
   * GET /dashboard/profile — Retorna o perfil do usuário autenticado (sem passwordHash).
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const profile = await this.service.getProfile(userId);
      sendSuccess(res, profile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /dashboard/profile — Atualiza nome e/ou email do usuário autenticado.
   * Ao menos um campo deve ser informado.
   */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const data = parseBody(updateProfileSchema, req);
      const updated = await this.service.updateProfile(userId, data);
      sendSuccess(res, updated);
    } catch (error) {
      next(error);
    }
  }
}
