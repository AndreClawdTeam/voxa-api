import { and, count, eq } from 'drizzle-orm';
import { db } from '../../db';
import { type ApiKey, type NewApiKey, apiKeys } from '../../db/schema';

/** ApiKey pública sem o campo `keyHash` (nunca exposto para o cliente). */
export type PublicApiKey = Omit<ApiKey, 'keyHash'>;

export class ApiKeysRepository {
  /**
   * Insere uma nova API key no banco de dados.
   * O `keyHash` deve ser o SHA-256 do token — nunca armazenar o token em plaintext.
   *
   * @param data - Dados da key a inserir (com `keyHash`)
   * @returns API key criada
   */
  async create(data: NewApiKey): Promise<ApiKey> {
    const [key] = await db.insert(apiKeys).values(data).returning();
    return key;
  }

  /**
   * Lista todas as API keys ativas (não revogadas) do usuário, sem expor o `keyHash`.
   *
   * @param userId - ID do usuário
   * @returns Array de keys públicas
   */
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

  /**
   * Busca uma API key pelo hash SHA-256 do token.
   * Usado na autenticação por API key para validar o Bearer token recebido.
   *
   * @param keyHash - Hash SHA-256 do token
   * @returns API key encontrada (ativa) ou `undefined`
   */
  async findByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isRevoked, false)))
      .limit(1);
    return key;
  }

  /**
   * Revoga uma API key específica do usuário (soft delete via flag `isRevoked`).
   * Só revoga se o `userId` corresponder ao dono da key.
   *
   * @param id - UUID da key a revogar
   * @param userId - ID do usuário dono da key (validação de ownership)
   * @returns Key atualizada ou `undefined` se não encontrada/não pertencer ao usuário
   */
  async revoke(id: string, userId: string): Promise<ApiKey | undefined> {
    const [key] = await db
      .update(apiKeys)
      .set({ isRevoked: true })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .returning();
    return key;
  }

  /**
   * Atualiza o `lastUsedAt` da key para o momento atual.
   * Chamado de forma assíncrona (fire-and-forget) após autenticação bem-sucedida.
   *
   * @param id - UUID da key a atualizar
   */
  async updateLastUsed(id: string): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  /**
   * Conta o número de API keys ativas do usuário.
   * Usado para verificar o limite de keys antes de criar uma nova.
   *
   * @param userId - ID do usuário
   * @returns Quantidade de keys ativas
   */
  async countByUserId(userId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isRevoked, false)));
    return value ?? 0;
  }
}
