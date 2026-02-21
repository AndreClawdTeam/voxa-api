import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../lib/errors';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { AdminService } from './admin.service';

const PaginationSchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).default('1'),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('20'),
  search: z.string().optional(),
});

const UpdateSubscriptionSchema = z.object({
  tier: z.enum(['trial', 'basic', 'pro']).optional(),
  status: z.enum(['active', 'trial', 'suspended', 'cancelled']).optional(),
});

export class AdminController {
  constructor(private readonly service: AdminService) {}

  async listUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;

      const parsed = PaginationSchema.safeParse(req.query);
      if (!parsed.success) {
        return next(new ValidationError('Invalid pagination parameters'));
      }

      const { page, limit, search } = parsed.data;
      const result = await this.service.listUsers(userId, { page, limit, search });

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

  async getUserDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const id = req.params.id as string;

      const details = await this.service.getUserDetails(userId, id);
      return res.json({ data: details });
    } catch (error) {
      return next(error);
    }
  }

  async updateSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const id = req.params.id as string;

      const parsed = UpdateSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError('Invalid subscription data'));
      }

      if (!parsed.data.tier && !parsed.data.status) {
        return next(new ValidationError('At least one field (tier or status) must be provided'));
      }

      const updated = await this.service.updateSubscription(userId, id, parsed.data);
      return res.json({ data: updated });
    } catch (error) {
      return next(error);
    }
  }

  async getAuditLog(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;

      const parsed = PaginationSchema.safeParse(req.query);
      if (!parsed.success) {
        return next(new ValidationError('Invalid pagination parameters'));
      }

      const { page, limit } = parsed.data;
      const result = await this.service.getAuditLog(userId, { page, limit });

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

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const stats = await this.service.getDashboardStats(userId);
      return res.json({ data: stats });
    } catch (error) {
      return next(error);
    }
  }
}
