import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { type NewSubscription, type Subscription, subscriptions } from '../../db/schema';

export class SubscriptionsRepository {
  /**
   * Busca a assinatura de um usuário pelo `userId`.
   *
   * @param userId - ID do usuário
   * @returns Assinatura encontrada ou `undefined`
   */
  async findByUserId(userId: string): Promise<Subscription | undefined> {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    return sub;
  }

  /**
   * Insere uma nova assinatura no banco de dados.
   * Usado no registro de novos usuários (trial).
   *
   * @param data - Dados da assinatura a inserir
   * @returns Assinatura criada
   */
  async create(data: NewSubscription): Promise<Subscription> {
    const [sub] = await db.insert(subscriptions).values(data).returning();
    return sub;
  }

  /**
   * Atualiza o tier e status de uma assinatura existente.
   * Usado no upgrade de plano.
   *
   * @param userId - ID do usuário dono da assinatura
   * @param tier - Novo tier (`trial`, `basic`, `pro`)
   * @param status - Novo status (`active`, `trial`, `suspended`, `cancelled`)
   * @returns Assinatura atualizada
   */
  async updateTier(
    userId: string,
    tier: 'trial' | 'basic' | 'pro',
    status: 'active' | 'trial' | 'suspended' | 'cancelled',
  ): Promise<Subscription> {
    const [sub] = await db
      .update(subscriptions)
      .set({ tier, status, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return sub;
  }

  /**
   * Cancela a assinatura do usuário, definindo status `cancelled` e `cancelledAt`.
   *
   * @param userId - ID do usuário
   * @returns Assinatura atualizada com status `cancelled`
   */
  async cancel(userId: string): Promise<Subscription> {
    const [sub] = await db
      .update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();
    return sub;
  }
}
