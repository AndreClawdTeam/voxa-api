import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('App', () => {
  const app = createApp();

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
