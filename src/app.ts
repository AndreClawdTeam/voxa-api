import cookieParser from 'cookie-parser';
import cors from 'cors';
import { sql } from 'drizzle-orm';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { db } from './db';
import { AppError, ValidationError } from './lib/errors';
import { logger } from './lib/logger';
import { swaggerSpec } from './lib/swagger';
import { adminRouter } from './modules/admin/admin.routes';
import { apiKeysRouter } from './modules/api-keys/api-keys.routes';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.routes';
import { transcriptionRouter } from './modules/transcription/transcription.routes';

export function createApp() {
  const app = express();

  // ─── Security headers (helmet removes X-Powered-By, adds CSP, HSTS, etc.) ──
  app.use(helmet());

  // ─── Cookie parser — required to read HttpOnly refresh token cookie ────────
  app.use(cookieParser());

  // ─── CORS — explicit allowlist in production, credentials for cookie support ─
  app.use(
    cors({
      origin:
        env.NODE_ENV === 'production'
          ? env.ALLOWED_ORIGINS // string[] validated by Zod
          : ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true, // REQUIRED for cookies (Authorization + Set-Cookie)
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // ─── Global rate limit (per IP) — protects all endpoints from DoS ────────
  // This fires BEFORE any route, including /auth/register and /api/docs
  app.use(
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 1000, // 1 000 req/min per IP (burst protection)
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
      },
    }),
  );

  // ─── Structured HTTP logging via pino ────────────────────────────────────
  app.use(pinoHttp({ logger }));

  // ─── Body parsing — explicit 100 KB limit to prevent payload attacks ─────
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // ─── Health check — verifies DB connectivity ─────────────────────────────
  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      return res.json({ status: 'ok', uptime: process.uptime(), database: 'connected' });
    } catch {
      return res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  // ─── Swagger UI ───────────────────────────────────────────────────────────
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // ─── API routes ───────────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/transcribe', transcriptionRouter);
  app.use('/api/v1/keys', apiKeysRouter);
  app.use('/api/v1/subscriptions', subscriptionsRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/admin', adminRouter);

  // ─── Global error handler ─────────────────────────────────────────────────
  app.use(
    (
      err: Error & { status?: number; statusCode?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof AppError) {
        const body: Record<string, unknown> = {
          code: err.code,
          message: err.message,
        };

        // Include structured field errors for ValidationError
        if (err instanceof ValidationError && Object.keys(err.errors).length > 0) {
          body.errors = err.errors;
        }

        return res.status(err.statusCode).json(body);
      }

      // Handle HTTP errors with explicit status codes (e.g. 413 Payload Too Large from express.json)
      const httpStatus = err.status ?? err.statusCode;
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        return res.status(httpStatus).json({
          code: err.type ?? 'REQUEST_ERROR',
          message: err.message,
        });
      }

      // Stack trace ONLY in development — never leak internals in production
      logger.error({ err }, 'Unhandled error');
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    },
  );

  return app;
}
