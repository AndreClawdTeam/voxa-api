import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  RATE_LIMIT_TRIAL_RPM: z.string().transform(Number).default('20'),
  RATE_LIMIT_BASIC_RPM: z.string().transform(Number).default('60'),
  RATE_LIMIT_PRO_RPM: z.string().transform(Number).default('300'),
  TRIAL_DURATION_DAYS: z.string().transform(Number).default('7'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  WHISPER_PYTHON: z.string().default('python3'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
