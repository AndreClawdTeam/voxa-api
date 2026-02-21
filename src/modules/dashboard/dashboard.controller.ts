import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../lib/errors';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { DashboardService } from './dashboard.service';

const PaginationSchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).default('1'),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('20'),
});

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const summary = await this.service.getUsageSummary(userId);
      return res.json({ data: summary });
    } catch (error) {
      return next(error);
    }
  }

  async getTranscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;

      const parsed = PaginationSchema.safeParse(req.query);
      if (!parsed.success) {
        return next(new ValidationError('Invalid pagination parameters'));
      }

      const { page, limit } = parsed.data;
      const result = await this.service.getTranscriptionHistory(userId, page, limit);

      return res.json({
        data: result.data,
        pagination: {
          page: result.page,
          limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const profile = await this.service.getProfile(userId);
      return res.json({ data: profile });
    } catch (error) {
      return next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;

      const parsed = UpdateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError('Invalid profile data'));
      }

      const updated = await this.service.updateProfile(userId, parsed.data);
      return res.json({ data: updated });
    } catch (error) {
      return next(error);
    }
  }
}
