import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../lib/errors';
import type { AuthenticatedRequest } from './authenticate';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = (req as AuthenticatedRequest).user;
  if (!user || user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }
  return next();
}
