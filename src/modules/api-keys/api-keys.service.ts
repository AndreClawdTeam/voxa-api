import * as crypto from 'node:crypto';
import { ForbiddenError, ValidationError } from '../../lib/errors';
import type { ApiKeysRepository, PublicApiKey } from './api-keys.repository';

export class ApiKeysService {
  constructor(private readonly apiKeysRepo: ApiKeysRepository) {}

  static readonly MAX_KEYS_PER_USER = 10;

  /**
   * Cria uma nova API key para o usuário.
   *
   * Gera um token aleatório com prefixo `vxa_` e 64 caracteres hex (32 bytes).
   * Armazena apenas o hash SHA-256 — o `rawToken` é retornado **apenas uma vez**.
   *
   * @param userId - ID do usuário dono da key
   * @param label - Nome descritivo para identificar a key
   * @returns Registro da key criada, incluindo `rawToken` (exibido somente na criação)
   * @throws {ValidationError} Se o usuário já atingiu o limite de {MAX_KEYS_PER_USER} keys
   */
  async createKey(userId: string, label: string) {
    // Enforce per-user limit to prevent API key hoarding / DoS on auth lookups
    const existingCount = await this.apiKeysRepo.countByUserId(userId);
    if (existingCount >= ApiKeysService.MAX_KEYS_PER_USER) {
      throw new ValidationError(
        `Maximum of ${ApiKeysService.MAX_KEYS_PER_USER} API keys per account`,
      );
    }

    // Generate token: vxa_ + 64 hex chars (32 random bytes)
    const rawToken = `vxa_${crypto.randomBytes(32).toString('hex')}`;

    // Store SHA-256 hash, never the raw token
    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const key = await this.apiKeysRepo.create({ userId, label, keyHash });

    // Return key with rawToken — only available at creation time
    return { ...key, rawToken };
  }

  /**
   * Lista todas as API keys do usuário (sem expor os hashes).
   *
   * @param userId - ID do usuário dono das keys
   * @returns Array de keys públicas (sem `keyHash`)
   */
  async listKeys(userId: string): Promise<PublicApiKey[]> {
    return this.apiKeysRepo.findByUserId(userId);
  }

  /**
   * Revoga uma API key específica do usuário.
   *
   * @param id - UUID da key a revogar
   * @param userId - ID do usuário (garante que a key pertence a ele)
   * @returns Registro da key após revogação
   * @throws {ForbiddenError} Se a key não existir ou não pertencer ao usuário
   */
  async revokeKey(id: string, userId: string) {
    const key = await this.apiKeysRepo.revoke(id, userId);

    if (!key) {
      throw new ForbiddenError('API key not found or does not belong to this user');
    }

    return key;
  }
}
