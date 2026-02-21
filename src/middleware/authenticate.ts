import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors';
import { verifyToken } from '../lib/jwt';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or invalid authorization header'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = {
      userId: payload.userId as string,
      role: payload.role as string,
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
