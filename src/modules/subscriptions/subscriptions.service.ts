import { ConflictError, NotFoundError } from '../../lib/errors';
import type { SubscriptionsRepository } from './subscriptions.repository';

export class SubscriptionsService {
  constructor(private readonly subscriptionsRepo: SubscriptionsRepository) {}

  /**
   * Retorna a assinatura ativa do usuário.
   *
   * @param userId - ID do usuário
   * @returns Assinatura encontrada
   * @throws {NotFoundError} Se o usuário não possuir assinatura
   */
  async getMySubscription(userId: string) {
    const subscription = await this.subscriptionsRepo.findByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No subscription found for this user');
    }
    return subscription;
  }

  /**
   * Faz upgrade do plano do usuário para `basic` ou `pro`.
   * Define o status da assinatura como `active` após o upgrade.
   *
   * @param userId - ID do usuário
   * @param newTier - Novo tier desejado (`basic` ou `pro`)
   * @returns Assinatura atualizada
   * @throws {NotFoundError} Se o usuário não possuir assinatura
   * @throws {ConflictError} Se o usuário já estiver no tier solicitado
   */
  async upgradePlan(userId: string, newTier: 'basic' | 'pro') {
    const subscription = await this.subscriptionsRepo.findByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No subscription found for this user');
    }

    if (subscription.tier === newTier) {
      throw new ConflictError(`You are already on the ${newTier} plan`);
    }

    return this.subscriptionsRepo.updateTier(userId, newTier, 'active');
  }

  /**
   * Cancela a assinatura do usuário, definindo o status como `cancelled`.
   *
   * @param userId - ID do usuário
   * @returns Assinatura atualizada com status `cancelled`
   * @throws {NotFoundError} Se o usuário não possuir assinatura
   */
  async cancelSubscription(userId: string) {
    const subscription = await this.subscriptionsRepo.findByUserId(userId);
    if (!subscription) {
      throw new NotFoundError('No subscription found for this user');
    }

    return this.subscriptionsRepo.cancel(userId);
  }
}
