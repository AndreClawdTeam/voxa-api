import { sql } from 'drizzle-orm';
import express from 'express';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { db } from './db';
import { AppError } from './lib/errors';
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

  // Structured HTTP logging via pino
  app.use(pinoHttp({ logger }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check — verifies DB connectivity
  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      return res.json({ status: 'ok', uptime: process.uptime(), database: 'connected' });
    } catch {
      return res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  // Swagger UI
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // API routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/transcribe', transcriptionRouter);
  app.use('/api/v1/keys', apiKeysRouter);
  app.use('/api/v1/subscriptions', subscriptionsRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/admin', adminRouter);

  // Global error handler
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          code: err.code,
          message: err.message,
        });
      }
      logger.error(err);
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    },
  );

  return app;
}
