import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import { cleanDatabase, getSubscriptionByUserId, seedUser } from './helpers/db';
import { uniqueEmail } from './helpers/fixtures';

describe('Auth — Fluxo completo de usuário', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ─── Cenário 1: Cadastro de novo usuário ────────────────────────────────────
  it('deve registrar um novo usuário e criar trial automático', async () => {
    const api = createTestApp(); // fresh instance → fresh rate limiter
    const email = uniqueEmail('register');

    const res = await api
      .post('/api/v1/auth/register')
      .send({ name: 'João Teste', email, password: 'Senha12345!' })
      .expect(201);

    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBe('customer');

    // Cookie refreshToken deve estar presente
    const cookies: string[] = res.headers['set-cookie'] ?? [];
    const hasRefreshCookie = cookies.some((c: string) => c.startsWith('refreshToken='));
    expect(hasRefreshCookie).toBe(true);

    // Verificar subscription criada no banco
    const sub = await getSubscriptionByUserId(res.body.data.user.id);
    expect(sub).not.toBeNull();
    expect(sub?.tier).toBe('trial');
    expect(sub?.status).toBe('trial');
    expect(sub?.trialEndsAt).toBeDefined();

    // trialEndsAt deve ser ~7 dias no futuro (entre 6 e 8 dias)
    const trialEndsAt = new Date(sub!.trialEndsAt!);
    const sixDaysFromNow = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const eightDaysFromNow = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(trialEndsAt.getTime()).toBeGreaterThan(sixDaysFromNow.getTime());
    expect(trialEndsAt.getTime()).toBeLessThan(eightDaysFromNow.getTime());
  });

  // ─── Cenário 2: Cadastro com email duplicado ────────────────────────────────
  it('deve rejeitar cadastro com email duplicado (409)', async () => {
    const api = createTestApp();
    const email = uniqueEmail('dup');

    await api
      .post('/api/v1/auth/register')
      .send({ name: 'Usuário A', email, password: 'Senha12345!' })
      .expect(201);

    const res = await api
      .post('/api/v1/auth/register')
      .send({ name: 'Usuário B', email, password: 'Senha12345!' })
      .expect(409);

    expect(res.body.code).toBeDefined();
  });

  // ─── Cenário 3: Cadastro com dados inválidos ────────────────────────────────
  it('deve rejeitar cadastro sem email (400)', async () => {
    const api = createTestApp();
    const res = await api
      .post('/api/v1/auth/register')
      .send({ name: 'Sem Email', password: 'Senha12345!' })
      .expect(400);

    expect(res.body.errors ?? res.body.code).toBeDefined();
  });

  it('deve rejeitar cadastro com senha muito curta (400)', async () => {
    const api = createTestApp();
    const res = await api
      .post('/api/v1/auth/register')
      .send({ name: 'Senha Curta', email: uniqueEmail('short'), password: '123' })
      .expect(400);

    expect(res.body.code).toBeDefined();
  });

  it('deve rejeitar cadastro sem nome (400)', async () => {
    const api = createTestApp();
    const res = await api
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail('noname'), password: 'Senha12345!' })
      .expect(400);

    expect(res.body.code).toBeDefined();
  });

  // ─── Cenário 4: Login com credenciais corretas ──────────────────────────────
  it('deve autenticar usuário com credenciais válidas (200)', async () => {
    const api = createTestApp();
    const user = await seedUser({ email: uniqueEmail('login') });

    const res = await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(res.body.data.accessToken).toBeDefined();

    const cookies: string[] = res.headers['set-cookie'] ?? [];
    const hasRefreshCookie = cookies.some((c: string) => c.startsWith('refreshToken='));
    expect(hasRefreshCookie).toBe(true);
  });

  // ─── Cenário 5: Login com credenciais erradas ───────────────────────────────
  it('deve rejeitar login com senha errada (401)', async () => {
    const api = createTestApp();
    const user = await seedUser({ email: uniqueEmail('wrongpwd') });

    await api
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'SenhaErrada999!' })
      .expect(401);
  });

  it('deve rejeitar login com email inexistente (401)', async () => {
    const api = createTestApp();
    await api
      .post('/api/v1/auth/login')
      .send({ email: 'naoexiste@integration.test', password: 'Senha12345!' })
      .expect(401);
  });

  // ─── Cenário 6: Refresh de token ────────────────────────────────────────────
  it('deve renovar o access token via refresh token cookie', async () => {
    const api = createTestApp();
    const email = uniqueEmail('refresh');

    const regRes = await api
      .post('/api/v1/auth/register')
      .send({ name: 'Refresh User', email, password: 'Senha12345!' })
      .expect(201);

    const cookies: string[] = regRes.headers['set-cookie'] ?? [];
    const refreshCookie = cookies.find((c: string) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();

    const refreshRes = await api
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie!)
      .expect(200);

    const newAccessToken = refreshRes.body.data.accessToken;
    expect(newAccessToken).toBeDefined();

    // Novo cookie refreshToken deve estar presente
    const newCookies: string[] = refreshRes.headers['set-cookie'] ?? [];
    const newRefreshCookie = newCookies.find((c: string) => c.startsWith('refreshToken='));
    expect(newRefreshCookie).toBeDefined();
  });

  // ─── Cenário 7: Refresh sem cookie ──────────────────────────────────────────
  it('deve rejeitar refresh sem cookie (401)', async () => {
    const api = createTestApp();
    await api.post('/api/v1/auth/refresh').expect(401);
  });

  // ─── Cenário 8: /me retorna dados do usuário autenticado ────────────────────
  it('deve retornar dados do usuário autenticado em /me', async () => {
    const api = createTestApp();
    const email = uniqueEmail('me');

    const regRes = await api
      .post('/api/v1/auth/register')
      .send({ name: 'Me User', email, password: 'Senha12345!' })
      .expect(201);

    const { accessToken } = regRes.body.data;

    const meRes = await api
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meRes.body.data.userId).toBe(regRes.body.data.user.id);
    expect(meRes.body.data.role).toBe('customer');
  });

  // ─── Cenário 9: /me com token inválido ──────────────────────────────────────
  it('deve rejeitar /me com token inválido (401)', async () => {
    const api = createTestApp();
    await api.get('/api/v1/auth/me').set('Authorization', 'Bearer token.falso.aqui').expect(401);
  });

  it('deve rejeitar /me sem Authorization header (401)', async () => {
    const api = createTestApp();
    await api.get('/api/v1/auth/me').expect(401);
  });

  // ─── Cenário 10: Logout ──────────────────────────────────────────────────────
  it('deve invalidar refresh token após logout', async () => {
    const api = createTestApp();
    const email = uniqueEmail('logout');

    const regRes = await api
      .post('/api/v1/auth/register')
      .send({ name: 'Logout User', email, password: 'Senha12345!' })
      .expect(201);

    const { accessToken } = regRes.body.data;
    const cookies: string[] = regRes.headers['set-cookie'] ?? [];
    const refreshCookie = cookies.find((c: string) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();

    // Fazer logout — precisa enviar o cookie para o servidor poder revogar o jti
    await api
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refreshCookie!)
      .expect(204);

    // Tentar usar o mesmo refresh token — deve ser rejeitado
    await api.post('/api/v1/auth/refresh').set('Cookie', refreshCookie!).expect(401);
  });
});
