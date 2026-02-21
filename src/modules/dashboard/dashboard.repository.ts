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

  async findUserById(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }
}
