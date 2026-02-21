import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import { cleanDatabase, seedSubscription, seedTranscription, seedUser } from './helpers/db';
import { uniqueEmail } from './helpers/fixtures';

const api = createTestApp();

describe('Dashboard — Histórico e estatísticas do usuário', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ─── Helper: login e retornar accessToken ───────────────────────────────────
  async function loginAs(email: string, password: string): Promise<string> {
    const res = await api.post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.body.data.accessToken;
  }

  // ─── Cenário 1: Dashboard vazio (novo usuário) ──────────────────────────────
  it('deve retornar histórico vazio para usuário novo', async () => {
    const user = await seedUser({ email: uniqueEmail('dash-empty') });
    await seedSubscription({ userId: user.id });

    const token = await loginAs(user.email, user.password);

    // Verificar endpoint de usage
    const usageRes = await api
      .get('/api/v1/dashboard/usage')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(usageRes.body.data).toBeDefined();
    expect(usageRes.body.data.totalTranscriptions).toBe(0);

    // Verificar endpoint de transcriptions
    const transRes = await api
      .get('/api/v1/dashboard/transcriptions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(transRes.body.data).toBeDefined();
    // Deve ser array vazio ou objeto com data vazio
    const items = Array.isArray(transRes.body.data)
      ? transRes.body.data
      : (transRes.body.data.data ?? []);
    expect(items.length).toBe(0);
  });

  // ─── Cenário 2: Dashboard com histórico ────────────────────────────────────
  it('deve retornar histórico de transcrições do usuário', async () => {
    const user = await seedUser({ email: uniqueEmail('dash-history') });
    await seedSubscription({ userId: user.id });

    // Seed 3 transcrições
    await seedTranscription({ userId: user.id, audioFilename: 'audio-1.wav' });
    await seedTranscription({ userId: user.id, audioFilename: 'audio-2.wav' });
    await seedTranscription({ userId: user.id, audioFilename: 'audio-3.wav' });

    const token = await loginAs(user.email, user.password);

    const res = await api
      .get('/api/v1/dashboard/transcriptions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const items = Array.isArray(res.body.data) ? res.body.data : (res.body.data?.data ?? []);

    expect(items.length).toBeGreaterThanOrEqual(3);

    // Verificar campos esperados
    const first = items[0];
    expect(first.id).toBeDefined();
    expect(first.status).toBeDefined();
    expect(first.createdAt).toBeDefined();
  });

  // ─── Cenário 3: Dashboard só vê dados do próprio usuário ───────────────────
  it('deve exibir apenas as transcrições do usuário autenticado', async () => {
    const userA = await seedUser({ email: uniqueEmail('dash-isolate-a') });
    const userB = await seedUser({ email: uniqueEmail('dash-isolate-b') });
    await seedSubscription({ userId: userA.id });
    await seedSubscription({ userId: userB.id });

    // Seed transcrições para ambos
    await seedTranscription({
      userId: userA.id,
      audioFilename: 'audio-de-a.wav',
      transcribedText: 'Conteúdo exclusivo do usuário A',
    });
    await seedTranscription({
      userId: userB.id,
      audioFilename: 'audio-de-b.wav',
      transcribedText: 'Conteúdo exclusivo do usuário B',
    });

    // Usuário A faz login e consulta dashboard
    const tokenA = await loginAs(userA.email, userA.password);

    const res = await api
      .get('/api/v1/dashboard/transcriptions')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const items = Array.isArray(res.body.data) ? res.body.data : (res.body.data?.data ?? []);

    // Nenhuma transcrição de userB deve aparecer
    const hasUserBData = items.some(
      (t: { audioFilename?: string }) => t.audioFilename === 'audio-de-b.wav',
    );
    expect(hasUserBData).toBe(false);

    // Transcrição de userA deve aparecer
    const hasUserAData = items.some(
      (t: { audioFilename?: string }) => t.audioFilename === 'audio-de-a.wav',
    );
    expect(hasUserAData).toBe(true);
  });

  // ─── Cenário 4: Dashboard sem autenticação ──────────────────────────────────
  it('deve rejeitar acesso ao dashboard sem autenticação (401)', async () => {
    await api.get('/api/v1/dashboard/usage').expect(401);
    await api.get('/api/v1/dashboard/transcriptions').expect(401);
    await api.get('/api/v1/dashboard/profile').expect(401);
  });

  // ─── Cenário extra: Profile retorna dados do usuário ───────────────────────
  it('deve retornar perfil do usuário autenticado', async () => {
    const user = await seedUser({ email: uniqueEmail('dash-profile') });
    await seedSubscription({ userId: user.id });

    const token = await loginAs(user.email, user.password);

    const res = await api
      .get('/api/v1/dashboard/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.email ?? res.body.data.user?.email).toBeDefined();
  });
});
