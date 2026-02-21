import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../lib/errors';
import { requireUser, sendEmpty } from '../../lib/http';
import { parseBody } from '../../lib/validation';
import { loginSchema, registerSchema } from './auth.schema';
import type { AuthService } from './auth.service';

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Seta o refresh token como cookie HttpOnly no response.
 * HttpOnly impede que scripts (XSS) leiam o cookie — apenas o browser o envia automaticamente.
 */
function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production', // HTTPS only em produção
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias em ms (igual ao JWT_REFRESH_EXPIRES_IN)
    path: '/api/v1/auth', // cookie só enviado para /api/v1/auth/*
  });
}

/**
 * Remove o cookie de refresh token do response.
 */
function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register — Cadastra um novo usuário com trial de 7 dias.
   * Responde 201 com `{ data: { user, accessToken } }`.
   * O refreshToken é enviado como cookie HttpOnly (não exposto no body).
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = parseBody(registerSchema, req);
      const result = await this.authService.register(data);
      setRefreshTokenCookie(res, result.refreshToken);
      res.status(201).json({ data: { user: result.user, accessToken: result.accessToken } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login — Autentica com email e senha.
   * Responde 200 com `{ data: { accessToken } }`.
   * O refreshToken é enviado como cookie HttpOnly (não exposto no body).
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = parseBody(loginSchema, req);
      const result = await this.authService.login(data);
      setRefreshTokenCookie(res, result.refreshToken);
      res.status(200).json({ data: { accessToken: result.accessToken } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh — Renova o access token lendo o refresh token do cookie HttpOnly.
   * Implementa token rotation: o cookie é atualizado com o novo refresh token.
   * Responde 200 com `{ data: { accessToken } }`.
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Lê do cookie HttpOnly — nunca do body (segurança contra XSS)
      const tokenFromCookie: unknown = req.cookies.refreshToken;
      if (typeof tokenFromCookie !== 'string' || tokenFromCookie.length === 0) {
        throw new UnauthorizedError('Missing refresh token');
      }
      const result = await this.authService.refreshToken(tokenFromCookie);
      // Rotation: seta novo cookie com o novo refresh token
      setRefreshTokenCookie(res, result.refreshToken);
      res.status(200).json({ data: { accessToken: result.accessToken } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout — Invalida o refresh token no servidor (blacklist por jti) e limpa o cookie.
   * Requer autenticação via Bearer token (middleware `authenticate` na rota).
   * Responde 204 No Content.
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = requireUser(req);
      const tokenFromCookie: unknown = req.cookies.refreshToken;
      const refreshToken = typeof tokenFromCookie === 'string' ? tokenFromCookie : undefined;
      await this.authService.logout(userId, refreshToken);
      clearRefreshTokenCookie(res);
      sendEmpty(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/me — Retorna o payload do access token sem query no banco.
   * Útil para o frontend verificar auth e obter userId/role rapidamente.
   * Requer autenticação via Bearer token (middleware `authenticate` na rota).
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = requireUser(req);
      res.status(200).json({ data: user });
    } catch (error) {
      next(error);
    }
  }
}
