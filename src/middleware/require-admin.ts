import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../lib/errors';

/**
 * Middleware de autorização que garante que o usuário autenticado possui role `admin`.
 *
 * Deve ser usado **após** o middleware `authenticate`, que injeta `req.user`.
 * Se `req.user` não estiver definido ou o role for diferente de `admin`,
 * a requisição é rejeitada com 403 Forbidden.
 *
 * @throws {ForbiddenError} Se o usuário não for admin
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    next(new ForbiddenError('Admin access required'));
    return;
  }
  next();
}
