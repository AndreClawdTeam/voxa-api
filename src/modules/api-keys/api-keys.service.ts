import * as crypto from 'node:crypto';
import { ForbiddenError } from '../../lib/errors';
import type { ApiKeysRepository, PublicApiKey } from './api-keys.repository';

export class ApiKeysService {
  constructor(private readonly apiKeysRepo: ApiKeysRepository) {}

  async createKey(userId: string, label: string) {
    // Generate token: vxa_ + 64 hex chars (32 random bytes)
    const rawToken = `vxa_${crypto.randomBytes(32).toString('hex')}`;

    // Store SHA-256 hash, never the raw token
    const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const key = await this.apiKeysRepo.create({
      userId,
      label,
      keyHash,
    });

    // Return key with rawToken — only available at creation time
    return { ...key, rawToken };
  }

  async listKeys(userId: string): Promise<PublicApiKey[]> {
    return this.apiKeysRepo.findByUserId(userId);
  }

  async revokeKey(id: string, userId: string) {
    const key = await this.apiKeysRepo.revoke(id, userId);

    if (!key) {
      throw new ForbiddenError('API key not found or does not belong to this user');
    }

    return key;
  }
}
