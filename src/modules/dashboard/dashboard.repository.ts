import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  type Subscription,
  type Transcription,
  type User,
  subscriptions,
  transcriptions,
  users,
} from '../../db/schema';

export interface UsageSummaryData {
  totalTranscriptions: number;
  totalSeconds: number;
  monthTranscriptions: number;
  monthSeconds: number;
  subscription: Subscription | null;
}

export interface TranscriptionPage {
  data: Transcription[];
  total: number;
}

export interface ProfileData {
  user: User;
  subscription: Subscription | null;
}

export class DashboardRepository {
  /**
   * Agrega estatísticas de uso do usuário: total de transcrições e segundos transcritos
   * (all-time e mês atual). Também retorna a assinatura atual.
   *
   * @param userId - ID do usuário
   * @returns Dados de uso agregados com assinatura
   */
  async getUsageSummary(userId: string): Promise<UsageSummaryData> {
    // All-time aggregates
    const [allTime] = await db
      .select({
        totalTranscriptions: sql<number>`count(*)::int`,
        totalSeconds: sql<number>`coalesce(sum(audio_duration_seconds), 0)::float`,
      })
      .from(transcriptions)
      .where(eq(transcriptions.userId, userId));

    // Current month aggregates
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [thisMonth] = await db
      .select({
        monthTranscriptions: sql<number>`count(*)::int`,
        monthSeconds: sql<number>`coalesce(sum(audio_duration_seconds), 0)::float`,
      })
      .from(transcriptions)
      .where(and(eq(transcriptions.userId, userId), gte(transcriptions.createdAt, startOfMonth)));

    // Current subscription
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return {
      totalTranscriptions: allTime?.totalTranscriptions ?? 0,
      totalSeconds: allTime?.totalSeconds ?? 0,
      monthTranscriptions: thisMonth?.monthTranscriptions ?? 0,
      monthSeconds: thisMonth?.monthSeconds ?? 0,
      subscription: subscription ?? null,
    };
  }

  /**
   * Retorna o histórico paginado de transcrições do usuário, ordenado por data decrescente.
   *
   * @param userId - ID do usuário
   * @param options - Paginação: `page` e `limit`
   * @returns Página de transcrições com total de registros
   */
  async getTranscriptionHistory(
    userId: string,
    options: { page: number; limit: number },
  ): Promise<TranscriptionPage> {
    const offset = (options.page - 1) * options.limit;

    const data = await db
      .select()
      .from(transcriptions)
      .where(eq(transcriptions.userId, userId))
      .orderBy(desc(transcriptions.createdAt))
      .limit(options.limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transcriptions)
      .where(eq(transcriptions.userId, userId));

    return { data, total: count ?? 0 };
  }

  /**
   * Retorna o perfil completo do usuário com assinatura.
   *
   * @param userId - ID do usuário
   * @returns `{ user, subscription }` ou `null` se o usuário não existir
   */
  async getProfile(userId: string): Promise<ProfileData | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) return null;

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return { user, subscription: subscription ?? null };
  }

  /**
   * Atualiza nome e/ou email do usuário.
   *
   * @param userId - ID do usuário a atualizar
   * @param data - Campos a atualizar (`name` e/ou `email`)
   * @returns Usuário atualizado ou `null` se não encontrado
   */
  async updateProfile(
    userId: string,
    data: { name?: string; email?: string },
  ): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    return updated ?? null;
  }

  /**
   * Busca um usuário pelo UUID.
   *
   * @param userId - ID do usuário
   * @returns Usuário encontrado ou `undefined`
   */
  async findUserById(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }
}
