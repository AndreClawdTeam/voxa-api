import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';

// Mock DB so health check doesn't require a live database connection
vi.mock('./db', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
  pool: { end: vi.fn() },
}));

describe('App', () => {
  const app = createApp();

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  describe('Security headers (helmet)', () => {
    it('should NOT expose X-Powered-By header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should set X-Content-Type-Options: nosniff', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set X-Frame-Options to prevent clickjacking', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('Body size limit', () => {
    it('should reject JSON bodies larger than 100kb', async () => {
      // Create a payload slightly over 100kb
      const bigPayload = JSON.stringify({ data: 'x'.repeat(110 * 1024) });
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(bigPayload);
      expect(res.status).toBe(413);
    });
  });
});
