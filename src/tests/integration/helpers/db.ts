import * as crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../../db/schema';
import {
  type NewApiKey,
  type NewSubscription,
  type NewTranscription,
  type NewUser,
  apiKeys,
  auditLogs,
  subscriptions,
  transcriptions,
  usageLogs,
  users,
} from '../../../db/schema';

// Separate pool for helpers — uses the same DATABASE_URL from the test env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const testDb = drizzle(pool, { schema });

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Truncates all tables in the correct dependency order.
 * Call this in beforeAll/afterAll of each integration test suite.
 */
export async function cleanDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      audit_logs,
      usage_logs,
      transcriptions,
      api_keys,
      subscriptions,
      users
    CASCADE
  `);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export interface SeedUserOptions {
  name?: string;
  email?: string;
  password?: string;
  role?: 'customer' | 'admin';
  isActive?: boolean;
}

export interface SeededUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'customer' | 'admin';
  isActive: boolean;
}

/**
 * Seeds a user into the database with a hashed password.
 * Returns the user data including the plaintext password for use in login calls.
 */
export async function seedUser(options: SeedUserOptions = {}): Promise<SeededUser> {
  const uniqueSuffix = Date.now() + Math.random().toString(36).slice(2, 7);
  const password = options.password ?? 'TestPassword123!';
  const passwordHash = await bcrypt.hash(password, 10); // low rounds for speed in tests

  const [user] = await testDb
    .insert(users)
    .values({
      name: options.name ?? `Test User ${uniqueSuffix}`,
      email: options.email ?? `user-${uniqueSuffix}@integration.test`,
      passwordHash,
      role: options.role ?? 'customer',
      isActive: options.isActive ?? true,
    } satisfies NewUser)
    .returning();

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password,
    role: user.role as 'customer' | 'admin',
    isActive: user.isActive,
  };
}

export interface SeedSubscriptionOptions {
  userId: string;
  tier?: 'trial' | 'basic' | 'pro';
  status?: 'active' | 'trial' | 'suspended' | 'cancelled';
  trialEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

/**
 * Seeds a subscription for a user.
 * Defaults to an active trial subscription expiring in 7 days.
 */
export async function seedSubscription(options: SeedSubscriptionOptions) {
  const trialEndsAt =
    options.trialEndsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  const now = new Date();

  const [subscription] = await testDb
    .insert(subscriptions)
    .values({
      userId: options.userId,
      tier: options.tier ?? 'trial',
      status: options.status ?? 'trial',
      trialEndsAt: options.trialEndsAt !== undefined ? options.trialEndsAt : trialEndsAt,
      currentPeriodStart: options.currentPeriodStart ?? now,
      currentPeriodEnd: options.currentPeriodEnd ?? trialEndsAt,
    } satisfies NewSubscription)
    .returning();

  return subscription;
}

export interface SeedApiKeyOptions {
  userId: string;
  label?: string;
  isRevoked?: boolean;
}

export interface SeededApiKey {
  id: string;
  userId: string;
  label: string;
  rawToken: string;
  keyHash: string;
  isRevoked: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Seeds an API key for a user.
 * Returns the raw token (which the caller can use in Authorization headers).
 */
export async function seedApiKey(options: SeedApiKeyOptions): Promise<SeededApiKey> {
  const uniqueSuffix = Date.now().toString(16) + Math.random().toString(16).slice(2, 10);
  const rawToken = `vxa_${uniqueSuffix}`;
  const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const [key] = await testDb
    .insert(apiKeys)
    .values({
      userId: options.userId,
      keyHash,
      label: options.label ?? 'Test Key',
      isRevoked: options.isRevoked ?? false,
    } satisfies NewApiKey)
    .returning();

  return {
    id: key.id,
    userId: key.userId,
    label: key.label,
    rawToken,
    keyHash,
    isRevoked: key.isRevoked,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

export interface SeedTranscriptionOptions {
  userId: string;
  apiKeyId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  transcribedText?: string;
  detectedLanguage?: string;
  audioFilename?: string;
  audioDurationSeconds?: number;
  processingTimeMs?: number;
}

/**
 * Seeds a transcription record for a user.
 */
export async function seedTranscription(options: SeedTranscriptionOptions) {
  const [transcription] = await testDb
    .insert(transcriptions)
    .values({
      userId: options.userId,
      apiKeyId: options.apiKeyId,
      status: options.status ?? 'completed',
      transcribedText: options.transcribedText ?? 'Hello world',
      detectedLanguage: options.detectedLanguage ?? 'en',
      audioFilename: options.audioFilename ?? 'test-audio.wav',
      audioDurationSeconds: options.audioDurationSeconds ?? 1.5,
      audioSizeBytes: 50000,
      processingTimeMs: options.processingTimeMs ?? 1200,
    } satisfies NewTranscription)
    .returning();

  return transcription;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';

/** Fetch a subscription by userId directly from the integration DB. */
export async function getSubscriptionByUserId(userId: string) {
  const [sub] = await testDb
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return sub ?? null;
}

/** Fetch all transcriptions for a user from the integration DB. */
export async function getTranscriptionsByUserId(userId: string) {
  return testDb
    .select()
    .from(transcriptions)
    .where(eq(transcriptions.userId, userId));
}

/** Fetch all usage logs for a user from the integration DB. */
export async function getUsageLogsByUserId(userId: string) {
  return testDb.select().from(usageLogs).where(eq(usageLogs.userId, userId));
}
