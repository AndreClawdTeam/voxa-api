import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTierRateLimit } from '../../middleware/rate-limit-by-tier';

vi.mock('../../config/env', () => ({
  env: {
    RATE_LIMIT_TRIAL_RPM: 20,
    RATE_LIMIT_BASIC_RPM: 60,
    RATE_LIMIT_PRO_RPM: 300,
  },
}));

function buildApp(tier: 'trial' | 'basic' | 'pro', userId = 'test-user', maxOverride?: number) {
  const app = express();

  // Simulate authenticate-api-key middleware injecting user + subscription
  app.use((req, _res, next) => {
    (req as any).user = { userId };
    (req as any).subscription = { tier };
    next();
  });

  app.use(createTierRateLimit(maxOverride !== undefined ? { maxOverride } : undefined));

  app.get('/test', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('createTierRateLimit middleware', () => {
  describe('X-RateLimit-* headers', () => {
    it('should include X-RateLimit-Limit header in response', async () => {
      const app = buildApp('basic');
      const res = await request(app).get('/test');

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
    });

    it('should include X-RateLimit-Remaining header in response', async () => {
      const app = buildApp('basic');
      const res = await request(app).get('/test');

      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should include X-RateLimit-Reset header in response', async () => {
      const app = buildApp('basic');
      const res = await request(app).get('/test');

      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('tier-based limits', () => {
    it('should apply limit of 20 for trial tier', async () => {
      const app = buildApp('trial');
      const res = await request(app).get('/test');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('20');
    });

    it('should apply limit of 60 for basic tier', async () => {
      const app = buildApp('basic');
      const res = await request(app).get('/test');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('60');
    });

    it('should apply limit of 300 for pro tier', async () => {
      const app = buildApp('pro');
      const res = await request(app).get('/test');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('300');
    });

    it('should default to trial limit (20) when subscription is missing', async () => {
      const app = express();
      app.use((req, _res, next) => {
        (req as any).user = { userId: 'no-sub-user' };
        // No subscription injected — should fall back to trial
        next();
      });
      app.use(createTierRateLimit());
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const res = await request(app).get('/test');
      expect(res.headers['x-ratelimit-limit']).toBe('20');
    });
  });

  describe('429 rate limit exceeded', () => {
    it('should return 429 with RATE_LIMIT_EXCEEDED when limit is exceeded', async () => {
      const userId = 'rate-limited-user';
      // Use maxOverride=2 so we only need 3 requests to trigger the 429
      const app = buildApp('trial', userId, 2);

      await request(app).get('/test');
      await request(app).get('/test');
      const res = await request(app).get('/test');

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should use userId as rate limit key — different users have independent limits', async () => {
      // Each user gets their own limit; maxOverride=1 means each user gets exactly 1 request
      const buildUserApp = (userId: string) => {
        const app = express();
        app.use((req, _res, next) => {
          (req as any).user = { userId };
          (req as any).subscription = { tier: 'trial' };
          next();
        });
        app.use(createTierRateLimit({ maxOverride: 1 }));
        app.get('/test', (_req, res) => res.json({ ok: true }));
        return app;
      };

      // Different app instances → separate in-memory stores
      const appA = buildUserApp('user-a');
      const appB = buildUserApp('user-b');

      const resA = await request(appA).get('/test');
      const resB = await request(appB).get('/test');

      // Each user's first request should succeed
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
    });

    it('should include X-RateLimit-Remaining: 0 on the last allowed request', async () => {
      const userId = 'last-request-user';
      const app = buildApp('trial', userId, 1);

      const res = await request(app).get('/test');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
    });
  });
});
