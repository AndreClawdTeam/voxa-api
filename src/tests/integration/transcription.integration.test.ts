import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app';
import {
  cleanDatabase,
  getTranscriptionsByUserId,
  seedApiKey,
  seedSubscription,
  seedUser,
} from './helpers/db';
import { createSilentWavBuffer, uniqueEmail } from './helpers/fixtures';

const api = createTestApp();

describe('Transcription — Fluxo de transcrição real', () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  // ─── Cenário 1: Transcrição bem-sucedida com assinatura trial ativa ─────────
  it('deve transcrever áudio com assinatura trial ativa e API key válida', async () => {
    const user = await seedUser({ email: uniqueEmail('transcribe-ok') });
    // Trial ativo: trialEndsAt 7 dias no futuro
    await seedSubscription({
      userId: user.id,
      tier: 'trial',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const key = await seedApiKey({ userId: user.id, label: 'Transcription Key' });

    const wavBuffer = createSilentWavBuffer(1);

    const res = await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${key.rawToken}`)
      .attach('audio', wavBuffer, { filename: 'silence.wav', contentType: 'audio/wav' })
      .expect(200);

    expect(res.body.data.id).toBeDefined();
    // transcribedText pode ser string vazia para áudio silencioso
    expect(res.body.data.transcribedText).toBeDefined();
    expect(res.body.data.detectedLanguage).toBeDefined();
    expect(res.body.data.processingTimeMs).toBeGreaterThan(0);

    // Verificar no banco: transcrição criada com status 'completed'
    const transcriptions = await getTranscriptionsByUserId(user.id);
    expect(transcriptions.length).toBeGreaterThanOrEqual(1);
    const latest = transcriptions[0];
    expect(latest.status).toBe('completed');
    expect(latest.userId).toBe(user.id);
  }, 90000); // timeout extra para whisper

  // ─── Cenário 2: Transcrição sem API key ────────────────────────────────────
  it('deve rejeitar transcrição sem Authorization header (401)', async () => {
    const wavBuffer = createSilentWavBuffer(1);

    await api
      .post('/api/v1/transcribe')
      .attach('audio', wavBuffer, { filename: 'test.wav', contentType: 'audio/wav' })
      .expect(401);
  });

  // ─── Cenário 3: Transcrição com API key inválida ────────────────────────────
  it('deve rejeitar transcrição com API key inválida (401)', async () => {
    const wavBuffer = createSilentWavBuffer(1);

    await api
      .post('/api/v1/transcribe')
      .set('Authorization', 'Bearer vxa_chave_completamente_invalida_que_nao_existe')
      .attach('audio', wavBuffer, { filename: 'test.wav', contentType: 'audio/wav' })
      .expect(401);
  });

  // ─── Cenário 4: Transcrição com assinatura expirada ────────────────────────
  it('deve rejeitar transcrição com trial expirado (403)', async () => {
    const user = await seedUser({ email: uniqueEmail('transcribe-expired') });

    // Subscription trial com trialEndsAt no passado
    await seedSubscription({
      userId: user.id,
      tier: 'trial',
      status: 'trial',
      trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // ontem
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const key = await seedApiKey({ userId: user.id, label: 'Expired Trial Key' });
    const wavBuffer = createSilentWavBuffer(1);

    await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${key.rawToken}`)
      .attach('audio', wavBuffer, { filename: 'test.wav', contentType: 'audio/wav' })
      .expect(403);
  });

  // ─── Cenário 5: Transcrição com key revogada ───────────────────────────────
  it('deve rejeitar transcrição com API key revogada (401)', async () => {
    const user = await seedUser({ email: uniqueEmail('transcribe-revoked') });
    await seedSubscription({ userId: user.id, tier: 'trial', status: 'trial' });

    // Seed key revogada diretamente no banco
    const key = await seedApiKey({ userId: user.id, label: 'Key Revogada', isRevoked: true });

    const wavBuffer = createSilentWavBuffer(1);

    await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${key.rawToken}`)
      .attach('audio', wavBuffer, { filename: 'test.wav', contentType: 'audio/wav' })
      .expect(401);
  });

  // ─── Cenário 6: Upload de formato não suportado ────────────────────────────
  it('deve rejeitar upload de arquivo com formato não suportado', async () => {
    const user = await seedUser({ email: uniqueEmail('transcribe-fmt') });
    await seedSubscription({ userId: user.id, tier: 'trial', status: 'trial' });
    const key = await seedApiKey({ userId: user.id, label: 'Format Test Key' });

    // Enviar um arquivo .txt com content-type text/plain
    const res = await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${key.rawToken}`)
      .attach('audio', Buffer.from('este é um arquivo de texto, não áudio'), {
        filename: 'not-audio.txt',
        contentType: 'text/plain',
      });

    // multer rejeita antes do controller (fileFilter)
    // ou o serviço rejeita pelo magic-bytes check → deve ser erro >= 400
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ─── Cenário 7: Upload sem arquivo ────────────────────────────────────────
  it('deve rejeitar requisição sem o campo audio (400)', async () => {
    const user = await seedUser({ email: uniqueEmail('transcribe-nofile') });
    await seedSubscription({ userId: user.id, tier: 'trial', status: 'trial' });
    const key = await seedApiKey({ userId: user.id, label: 'No File Key' });

    // POST sem anexar arquivo — multer skips, req.file = undefined → ValidationError → 400
    const res = await api
      .post('/api/v1/transcribe')
      .set('Authorization', `Bearer ${key.rawToken}`)
      .send({}) // JSON body; multer won't process → req.file undefined
      .expect(400);

    expect(res.body.code).toBeDefined();
  });
});
