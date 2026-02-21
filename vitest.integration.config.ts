import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 60000, // 60s por teste (whisper pode ser lento)
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      PORT: '3099',
      DATABASE_URL:
        'postgresql://andre:u+oVn9kpPEL5MvibJgQgCJj8gHEXAK50@localhost:5432/voxa_integration',
      JWT_SECRET: 'integration-test-secret-must-be-at-least-32-chars',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      RATE_LIMIT_TRIAL_RPM: '100',
      RATE_LIMIT_BASIC_RPM: '100',
      RATE_LIMIT_PRO_RPM: '100',
      TRIAL_DURATION_DAYS: '7',
      LOG_LEVEL: 'error',
      WHISPER_PYTHON: '/home/clawdbot/.openclaw/workspace/venv/bin/python3',
      ALLOWED_ORIGINS: 'http://localhost:3000',
    },
  },
});
