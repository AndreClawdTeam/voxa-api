import type { NextFunction, Request, Response } from 'express';
import { sendEmpty } from '../../lib/http';
import { parseBody } from '../../lib/validation';
import { loginSchema, refreshTokenSchema, registerSchema } from './auth.schema';
import type { AuthService } from './auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register — Cadastra um novo usuário com trial de 7 dias.
   * Responde 201 com `{ user, accessToken, refreshToken }`.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = parseBody(registerSchema, req);
      const result = await this.authService.register(data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login — Autentica com email e senha.
   * Responde 200 com `{ accessToken, refreshToken }`.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = parseBody(loginSchema, req);
      const result = await this.authService.login(data);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh — Renova o access token com um refresh token válido.
   * Responde 200 com `{ accessToken }`.
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = parseBody(refreshTokenSchema, req);
      const result = await this.authService.refreshToken(data.refreshToken);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout — Invalida o refresh token no servidor (blacklist por jti).
   * Responde 204 No Content.
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId ?? '';
      // Extract refreshToken from body (optional — used to blacklist jti on server-side)
      const refreshToken =
        typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
      await this.authService.logout(userId, refreshToken);
      sendEmpty(res);
    } catch (error) {
      next(error);
    }
  }
}
