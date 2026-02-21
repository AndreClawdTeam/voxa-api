import pino from 'pino';
import { env } from '../config/env';

// Paths to redact from all log output — prevents passwords, API key hashes,
// and JWT tokens from leaking into log files / observability platforms.
const REDACT_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'key_hash',
  'keyHash',
  'accessToken',
  'refreshToken',
  'token',
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.key_hash',
  '*.keyHash',
  '*.accessToken',
  '*.refreshToken',
  'req.headers.authorization',
  'req.headers.cookie',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});
