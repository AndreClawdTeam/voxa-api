import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../lib/errors';
import type { AuthenticatedRequest } from '../../middleware/authenticate';
import type { ApiKeysService } from './api-keys.service';

const createKeySchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or less'),
});

const revokeKeySchema = z.object({
  id: z.string().uuid('Invalid API key ID'),
});

export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = createKeySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Validation failed');
      }

      const result = await this.apiKeysService.createKey(authReq.user.userId, parsed.data.label);

      return res.status(201).json({
        data: {
          id: result.id,
          userId: result.userId,
          label: result.label,
          isRevoked: result.isRevoked,
          lastUsedAt: result.lastUsedAt,
          createdAt: result.createdAt,
          rawToken: result.rawToken,
        },
        message: 'API key created. Save the rawToken — it will not be shown again.',
      });
    } catch (error) {
      return next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const keys = await this.apiKeysService.listKeys(authReq.user.userId);

      return res.status(200).json({ data: keys });
    } catch (error) {
      return next(error);
    }
  }

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = revokeKeySchema.safeParse(req.params);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Validation failed');
      }

      await this.apiKeysService.revokeKey(parsed.data.id, authReq.user.userId);

      return res.status(200).json({ message: 'API key revoked successfully' });
    } catch (error) {
      return next(error);
    }
  }
}
