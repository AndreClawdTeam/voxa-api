import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

// Brute-force protection: max 5 requests per 15 minutes per IP
const bruteForceLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  skip: (req) => req.path === '/register' || req.path === '/refresh' || req.path === '/logout',
});

const repo = new AuthRepository();
const service = new AuthService(repo);
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post('/register', controller.register.bind(controller));
authRouter.post('/login', bruteForceLimit, controller.login.bind(controller));
authRouter.post('/refresh', controller.refresh.bind(controller));
authRouter.post('/logout', controller.logout.bind(controller));
