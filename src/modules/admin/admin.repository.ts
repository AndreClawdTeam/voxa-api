import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  type AuditLog,
  type Subscription,
  type Transcription,
  type User,
  auditLogs,
  subscriptions,
  transcriptions,
  users,
} from '../../db/schema';

export interface UserWithSubscription extends Omit<User, 'passwordHash'> {
  subscription: {
    id: string;
    tier: string;
    status: string;
    trialEndsAt: Date | null;
  } | null;
}

export interface UserDetails extends Omit<User, 'passwordHash'> {
  subscription: Subscription | null;
  recentTranscriptions: Transcription[];
}

export interface AdminStats {
  totalUsers: number;
  totalTranscriptions: number;
  activeSubscriptions: {
    trial: number;
    basic: number;
    pro: number;
  };
}

export class AdminRepository {
  /**
   * Busca um usuário pelo UUID para verificar se é admin.
   *
   * @param userId - ID do usuário
   * @returns Usuário encontrado ou `undefined`
   */
  async findAdminById(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }

  /**
   * Lista todos os usuários do sistema com dados de assinatura (LEFT JOIN), paginado.
   * Suporta busca por nome ou email via `search`.
   * O `passwordHash` é excluído da seleção.
   *
   * @param opts - Opções de paginação e filtro
   * @returns Array de usuários com assinatura
   */
  async listUsers(opts: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<UserWithSubscription[]> {
    const offset = (opts.page - 1) * opts.limit;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        subId: subscriptions.id,
        tier: subscriptions.tier,
        status: subscriptions.status,
        trialEndsAt: subscriptions.trialEndsAt,
      })
      .from(users)
      .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
      .where(
        opts.search
          ? or(ilike(users.name, `%${opts.search}%`), ilike(users.email, `%${opts.search}%`))
          : undefined,
      )
      .orderBy(desc(users.createdAt))
      .limit(opts.limit)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      subscription: row.subId
        ? {
            id: row.subId,
            // row.tier and row.status are non-null when subId is truthy (LEFT JOIN matched).
            // Using ?? as a safe fallback to satisfy TypeScript's null narrowing.
            tier: row.tier ?? 'trial',
            status: row.status ?? 'active',
            trialEndsAt: row.trialEndsAt,
          }
        : null,
    }));
  }

  /**
   * Conta o total de usuários, com filtro opcional por nome ou email.
   *
   * @param search - Termo de busca opcional
   * @returns Total de usuários correspondentes
   */
  async countUsers(search?: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(
        search
          ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
          : undefined,
      );
    return count ?? 0;
  }

  /**
   * Retorna detalhes completos de um usuário: perfil, assinatura e últimas 10 transcrições.
   * O `passwordHash` é excluído do resultado.
   *
   * @param userId - ID do usuário
   * @returns Detalhes do usuário ou `null` se não encontrado
   */
  async getUserWithDetails(userId: string): Promise<UserDetails | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    const recentTranscriptions = await db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.userId, userId))
      .orderBy(desc(transcriptions.createdAt))
      .limit(10);

    // Omit passwordHash
    const { passwordHash: _, ...safeUser } = user;

    return {
      ...safeUser,
      subscription: subscription ?? null,
      recentTranscriptions,
    };
  }

  /**
   * Atualiza o tier e/ou status da assinatura de um usuário.
   * Registra a ação no `auditLogs` automaticamente (ação `UPDATE_SUBSCRIPTION`).
   *
   * @param userId - ID do usuário alvo
   * @param data - Campos a atualizar (`tier` e/ou `status`)
   * @param adminId - ID do admin que realizou a ação (para o audit log)
   * @returns Assinatura atualizada
   * @throws {Error} Se o usuário não possuir assinatura
   */
  async updateUserSubscription(
    userId: string,
    data: {
      tier?: 'trial' | 'basic' | 'pro';
      status?: 'active' | 'trial' | 'suspended' | 'cancelled';
    },
    adminId: string,
  ): Promise<Subscription> {
    // Update subscription
    const [updated] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId))
      .returning();

    if (!updated) {
      throw new Error(`No subscription found for user ${userId}`);
    }

    // Create audit log entry
    await db.insert(auditLogs).values({
      adminId,
      targetUserId: userId,
      action: 'UPDATE_SUBSCRIPTION',
      details: JSON.stringify(data),
    });

    return updated;
  }

  /**
   * Retorna entradas do audit log, ordenadas por data decrescente, paginado.
   *
   * @param opts - Paginação: `page` e `limit`
   * @returns Array de entradas do audit log
   */
  async getAuditLogs(opts: { page: number; limit: number }): Promise<AuditLog[]> {
    const offset = (opts.page - 1) * opts.limit;

    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit)
      .offset(offset);
  }

  /**
   * Conta o total de entradas no audit log.
   *
   * @returns Total de registros no audit log
   */
  async countAuditLogs(): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
    return count ?? 0;
  }

  /**
   * Retorna estatísticas globais: total de usuários, transcrições e distribuição de assinaturas
   * por tier (apenas status `active` ou `trial`).
   *
   * @returns Objeto com totais e mapa de assinaturas por tier
   */
  async getStats(): Promise<AdminStats> {
    const [{ totalUsers }] = await db
      .select({ totalUsers: sql<number>`count(*)::int` })
      .from(users);

    const [{ totalTranscriptions }] = await db
      .select({ totalTranscriptions: sql<number>`count(*)::int` })
      .from(transcriptions);

    const tierRows = await db
      .select({
        tier: subscriptions.tier,
        count: sql<number>`count(*)::int`,
      })
      .from(subscriptions)
      .where(or(eq(subscriptions.status, 'active'), eq(subscriptions.status, 'trial')))
      .groupBy(subscriptions.tier);

    const tierMap: Record<'trial' | 'basic' | 'pro', number> = { trial: 0, basic: 0, pro: 0 };
    for (const row of tierRows) {
      tierMap[row.tier] = row.count;
    }

    return {
      totalUsers: totalUsers ?? 0,
      totalTranscriptions: totalTranscriptions ?? 0,
      activeSubscriptions: tierMap,
    };
  }
}
