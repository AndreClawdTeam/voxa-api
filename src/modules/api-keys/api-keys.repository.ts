import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db';
import { type ApiKey, type NewApiKey, apiKeys } from '../../db/schema';

export type PublicApiKey = Omit<ApiKey, 'keyHash'>;

export class ApiKeysRepository {
  async create(data: NewApiKey): Promise<ApiKey> {
    const [key] = await db.insert(apiKeys).values(data).returning();
    return key;
  }

  async findByUserId(userId: string): Promise<PublicApiKey[]> {
    const keys = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        label: apiKeys.label,
        lastUsedAt: apiKeys.lastUsedAt,
        isRevoked: apiKeys.isRevoked,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isRevoked, false)));
    return keys;
  }

  async findByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isRevoked, false)))
      .limit(1);
    return key;
  }

  async revoke(id: string, userId: string): Promise<ApiKey | undefined> {
    const [key] = await db
      .update(apiKeys)
      .set({ isRevoked: true })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();
    return key;
  }

  async updateLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async countByUserId(userId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isRevoked, false)));
    return value ?? 0;
  }
}
