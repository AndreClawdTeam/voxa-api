import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/voxa_test',
      JWT_SECRET: 'test-secret-must-be-at-least-32-chars-long',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      RATE_LIMIT_TRIAL_RPM: '20',
      RATE_LIMIT_BASIC_RPM: '60',
      RATE_LIMIT_PRO_RPM: '300',
      TRIAL_DURATION_DAYS: '7',
      LOG_LEVEL: 'error',
      WHISPER_PYTHON: 'python3',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
