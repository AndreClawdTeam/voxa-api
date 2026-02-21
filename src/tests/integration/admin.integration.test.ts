import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import {
  cleanDatabase,
  seedApiKey,
  seedSubscription,
  seedUser,
} from './helpers/db';
import { createSilentWavBuffer, uniqueEmail } from './helpers/fixtures';

describe('Admin — Gestão de usuários', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ─── Helper: login e retornar accessToken ───────────────────────────────────
  // NOTE: uses a fresh api instance passed in — each test gets its own app to avoid rate limiting
  async function loginAs(
    api: ReturnType<typeof createTestApp>,
    email: string,
    password: string,
  ): Promise<string> {
    const res = await api
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.data.accessToken;
  }

  // ─── Cenário 1: Admin pode listar usuários ──────────────────────────────────
  it('admin deve listar todos os usuários com informações de assinatura', async () => {
    const api = createTestApp();

    const admin = await seedUser({
      email: uniqueEmail('admin-list'),
      role: 'admin',
    });
    await seedSubscription({ userId: admin.id, tier: 'pro', status: 'active' });

    // Criar 3 usuários comuns
    const users = await Promise.all([
      seedUser({ email: uniqueEmail('common-1') }),
      seedUser({ email: uniqueEmail('common-2') }),
      seedUser({ email: uniqueEmail('common-3') }),
    ]);
    await Promise.all(users.map((u) => seedSubscription({ userId: u.id })));

    const adminToken = await loginAs(api, admin.email, admin.password);

    const res = await api
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Deve retornar lista com pelo menos os 4 usuários criados (admin + 3 comuns)
    expect(res.body.data).toBeDefined();
    const userList = Array.isArray(res.body.data)
      ? res.body.data
      : res.body.data?.data ?? res.body.data?.users ?? [];

    expect(userList.length).toBeGreaterThanOrEqual(4);
  });

  // ─── Cenário 2: Cliente não pode acessar endpoints admin ───────────────────
  it('usuário comum não deve acessar endpoints admin (403)', async () => {
    const api = createTestApp();

    const user = await seedUser({ email: uniqueEmail('non-admin') });
    await seedSubscription({ userId: user.id });

    const token = await loginAs(api, user.email, user.password);

    await api
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await api
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  // ─── Cenário 3: Admin pode suspender assinatura de usuário ─────────────────
  it('admin deve poder suspender a assinatura de um usuário', async () => {
    const api = createTestApp();

    const admin = await seedUser({
      email: uniqueEmail('admin-suspend'),
      role: 'admin',
    });
    await seedSubscription({ userId: admin.id, tier: 'pro', status: 'active' });

    const targetUser = await seedUser({ email: uniqueEmail('target-suspend') });
    await seedSubscription({
      userId: targetUser.id,
      tier: 'trial',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const targetKey = await seedApiKey({
      userId: targetUser.id,
      label: 'Key Para Suspensão',
    });

    const adminToken = await loginAs(api, admin.email, admin.password);

    // Admin suspende a assinatura do usuário
    const suspendRes = await api
      .patch(`/api/v1/admin/users/${targetUser.id}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(200);

    expect(suspendRes.body.data).toBeDefined();

    // Usuário suspenso tenta transcrever → 403 (subscription not active)
    const wavBuffer = createSilentWavBuffer(1);
    await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${targetKey.rawToken}`)
      .attach('audio', wavBuffer, { filename: 'test.wav', contentType: 'audio/wav' })
      .expect(403);
  });

  // ─── Cenário 4: Admin pode alterar plano de usuário ────────────────────────
  it('admin deve poder fazer upgrade do plano de um usuário (trial → basic)', async () => {
    const api = createTestApp();

    const admin = await seedUser({
      email: uniqueEmail('admin-upgrade'),
      role: 'admin',
    });
    await seedSubscription({ userId: admin.id, tier: 'pro', status: 'active' });

    const targetUser = await seedUser({ email: uniqueEmail('target-upgrade') });
    await seedSubscription({
      userId: targetUser.id,
      tier: 'trial',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const adminToken = await loginAs(api, admin.email, admin.password);
    const targetToken = await loginAs(api, targetUser.email, targetUser.password);

    // Admin faz upgrade do usuário para basic
    await api
      .patch(`/api/v1/admin/users/${targetUser.id}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tier: 'basic', status: 'active' })
      .expect(200);

    // Verificar via endpoint de subscriptions do próprio usuário
    const subRes = await api
      .get('/api/v1/subscriptions/me')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(200);

    expect(subRes.body.data.tier).toBe('basic');
    expect(subRes.body.data.status).toBe('active');
  });

  // ─── Cenário extra: Admin pode ver detalhes de um usuário ───────────────────
  it('admin deve poder ver detalhes de um usuário específico', async () => {
    const api = createTestApp();

    const admin = await seedUser({
      email: uniqueEmail('admin-details'),
      role: 'admin',
    });
    await seedSubscription({ userId: admin.id, tier: 'pro', status: 'active' });

    const targetUser = await seedUser({ email: uniqueEmail('target-details') });
    await seedSubscription({ userId: targetUser.id });

    const adminToken = await loginAs(api, admin.email, admin.password);

    const res = await api
      .get(`/api/v1/admin/users/${targetUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    const userData = res.body.data?.user ?? res.body.data;
    expect(userData?.id ?? userData?.userId).toBeDefined();
  });

  // ─── Cenário extra: Admin pode ver estatísticas globais ─────────────────────
  it('admin deve poder ver estatísticas globais do sistema', async () => {
    const api = createTestApp();

    const admin = await seedUser({
      email: uniqueEmail('admin-stats'),
      role: 'admin',
    });
    await seedSubscription({ userId: admin.id, tier: 'pro', status: 'active' });

    const adminToken = await loginAs(api, admin.email, admin.password);

    const res = await api
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(0);
    expect(res.body.data.totalTranscriptions).toBeGreaterThanOrEqual(0);
  });

  // ─── Cenário extra: Acesso sem autenticação → 401 ───────────────────────────
  it('deve rejeitar acesso admin sem autenticação (401)', async () => {
    const api = createTestApp();
    await api.get('/api/v1/admin/users').expect(401);
    await api.get('/api/v1/admin/stats').expect(401);
  });
});
