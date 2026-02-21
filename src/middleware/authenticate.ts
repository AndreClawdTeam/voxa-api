import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors';
import { verifyToken } from '../lib/jwt';

/**
 * Middleware de autenticação JWT (Bearer token).
 *
 * Extrai o token do header `Authorization: Bearer <token>`, verifica a assinatura,
 * expiração, issuer e audience, e injeta `req.user` com `userId` e `role`.
 *
 * @throws {UnauthorizedError} Se o header estiver ausente, malformado ou o token inválido
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      role: payload.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
