import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../lib/errors';
import { loginSchema, refreshTokenSchema, registerSchema } from './auth.schema';
import type { AuthService } from './auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Validation failed');
      }

      const result = await this.authService.register(parsed.data);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Validation failed');
      }

      const result = await this.authService.login(parsed.data);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = refreshTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.errors[0]?.message ?? 'Validation failed');
      }

      const result = await this.authService.refreshToken(parsed.data.refreshToken);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as Request & { user?: { userId: string } }).user?.userId ?? '';
      await this.authService.logout(userId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
}
