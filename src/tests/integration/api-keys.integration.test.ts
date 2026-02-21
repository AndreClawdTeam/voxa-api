import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import { cleanDatabase, seedApiKey, seedSubscription, seedUser } from './helpers/db';
import { uniqueEmail } from './helpers/fixtures';

const api = createTestApp();

describe('API Keys — Ciclo de vida completo', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ─── Cenário 1: Criar primeira API key ─────────────────────────────────────
  it('deve criar uma API key e retornar rawToken começando com vxa_', async () => {
    // Setup: criar usuário + subscription + login
    const user = await seedUser({ email: uniqueEmail('keys-create') });
    await seedSubscription({ userId: user.id });

    const loginRes = await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const { accessToken } = loginRes.body.data;

    // Criar API key
    const createRes = await api
      .post('/api/v1/keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Minha Key' })
      .expect(201);

    expect(createRes.body.data.rawToken).toBeDefined();
    expect(createRes.body.data.rawToken).toMatch(/^vxa_/);
    expect(createRes.body.data.id).toBeDefined();
    expect(createRes.body.data.label).toBe('Minha Key');

    const keyId = createRes.body.data.id;
    const rawToken = createRes.body.data.rawToken;

    // rawToken NÃO deve aparecer no GET /keys (só uma vez)
    const listRes = await api
      .get('/api/v1/keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const keys = listRes.body.data;
    expect(Array.isArray(keys)).toBe(true);
    const key = keys.find((k: { id: string }) => k.id === keyId);
    expect(key).toBeDefined();
    expect(key?.rawToken).toBeUndefined();
    // rawToken should not be in the listing — only id, label, isRevoked, createdAt, lastUsedAt
  });

  // ─── Cenário 2: Listar API keys ─────────────────────────────────────────────
  it('deve listar as API keys do usuário sem expor rawToken', async () => {
    const user = await seedUser({ email: uniqueEmail('keys-list') });
    await seedSubscription({ userId: user.id });

    // Seed 2 keys diretamente no banco
    await seedApiKey({ userId: user.id, label: 'Key A' });
    await seedApiKey({ userId: user.id, label: 'Key B' });

    const loginRes = await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const { accessToken } = loginRes.body.data;

    const listRes = await api
      .get('/api/v1/keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const keys = listRes.body.data;
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThanOrEqual(2);

    // Nenhuma key deve ter rawToken exposto
    for (const key of keys) {
      expect(key.rawToken).toBeUndefined();
      expect(key.id).toBeDefined();
      expect(key.label).toBeDefined();
      expect(key.isRevoked).toBeDefined();
      expect(key.createdAt).toBeDefined();
    }
  });

  // ─── Cenário 3: Revogar uma key ─────────────────────────────────────────────
  it('deve revogar uma API key e impedir seu uso posterior', async () => {
    const user = await seedUser({ email: uniqueEmail('keys-revoke') });
    await seedSubscription({ userId: user.id });
    const key = await seedApiKey({ userId: user.id, label: 'Key Para Revogar' });

    const loginRes = await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const { accessToken } = loginRes.body.data;

    // Revogar a key
    await api
      .delete(`/api/v1/keys/${key.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Tentar usar a key revogada no /transcribe → 401
    await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${key.rawToken}`)
      .attach('audio', Buffer.from('fake'), 'test.wav')
      .expect(401);
  });

  // ─── Cenário 4: Não pode revogar key de outro usuário ───────────────────────
  it('deve impedir que um usuário revogue key de outro usuário (403)', async () => {
    const userA = await seedUser({ email: uniqueEmail('keys-owner-a') });
    const userB = await seedUser({ email: uniqueEmail('keys-owner-b') });
    await seedSubscription({ userId: userA.id });
    await seedSubscription({ userId: userB.id });

    // Key pertence a userB
    const keyB = await seedApiKey({ userId: userB.id, label: 'Key do Usuário B' });

    // userA faz login
    const loginRes = await api
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);

    const { accessToken } = loginRes.body.data;

    // userA tenta revogar key de userB → 403
    const res = await api
      .delete(`/api/v1/keys/${keyB.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    // A API pode retornar 403 (key not owned by user) ou 404 (not found for this user)
    // ambos são aceitáveis para isolamento de dados
    expect([403, 404]).toContain(res.status);
  });

  // ─── Cenário 5: Criar key sem autenticação ───────────────────────────────────
  it('deve rejeitar criação de API key sem autenticação (401)', async () => {
    await api.post('/api/v1/keys').send({ label: 'Key Sem Auth' }).expect(401);
  });

  // ─── Cenário 6: Key com label duplicada ─────────────────────────────────────
  it('deve permitir ou rejeitar label duplicada conforme regra de negócio', async () => {
    const user = await seedUser({ email: uniqueEmail('keys-dup-label') });
    await seedSubscription({ userId: user.id });

    const loginRes = await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const { accessToken } = loginRes.body.data;

    // Criar primeira key
    await api
      .post('/api/v1/keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Label Duplicada' })
      .expect(201);

    // Criar segunda key com mesmo label — verifica comportamento (sem crash)
    const res = await api
      .post('/api/v1/keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'Label Duplicada' });

    // Seja 201 (permitido) ou 409 (conflito), a API deve responder de forma estruturada
    expect([201, 409, 400]).toContain(res.status);
    expect(res.body).toBeDefined();
  });
});
