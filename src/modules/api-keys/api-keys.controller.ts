import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { requireUser, sendCreated, sendSuccess } from '../../lib/http';
import { parseBody, parseParams } from '../../lib/validation';
import type { ApiKeysService } from './api-keys.service';

const createKeySchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label must be 100 characters or less'),
});

const revokeKeySchema = z.object({
  id: z.string().uuid('Invalid API key ID'),
});

export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * POST /keys — Cria uma nova API key para o usuário autenticado.
   * O `rawToken` é exibido **apenas nesta resposta** e não é armazenado em plaintext.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { label } = parseBody(createKeySchema, req);
      const result = await this.apiKeysService.createKey(userId, label);

      sendCreated(
        res,
        {
          id: result.id,
          userId: result.userId,
          label: result.label,
          isRevoked: result.isRevoked,
          lastUsedAt: result.lastUsedAt,
          createdAt: result.createdAt,
          rawToken: result.rawToken,
        },
        'API key created. Save the rawToken — it will not be shown again.',
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /keys — Lista todas as API keys do usuário autenticado.
   * Os hashes das keys não são retornados.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const keys = await this.apiKeysService.listKeys(userId);
      sendSuccess(res, keys);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /keys/:id — Revoga uma API key do usuário autenticado.
   * Retorna 403 se a key não pertencer ao usuário.
   */
  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const { id } = parseParams(revokeKeySchema, req);
      await this.apiKeysService.revokeKey(id, userId);
      res.status(200).json({ message: 'API key revoked successfully' });
    } catch (error) {
      next(error);
    }
  }
}
