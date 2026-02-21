import express from 'express';
import { AppError } from './lib/errors';
import { authRouter } from './modules/auth/auth.routes';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // API routes
  app.use('/api/v1/auth', authRouter);

  // Error handler global
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          code: err.code,
          message: err.message,
        });
      }
      console.error(err);
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    },
  );

  return app;
}
