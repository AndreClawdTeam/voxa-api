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
  async findAdminById(userId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user;
  }

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
            tier: row.tier as string,
            status: row.status as string,
            trialEndsAt: row.trialEndsAt,
          }
        : null,
    }));
  }

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

  async getAuditLogs(opts: { page: number; limit: number }): Promise<AuditLog[]> {
    const offset = (opts.page - 1) * opts.limit;

    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit)
      .offset(offset);
  }

  async countAuditLogs(): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
    return count ?? 0;
  }

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

    const tierMap = { trial: 0, basic: 0, pro: 0 };
    for (const row of tierRows) {
      if (row.tier in tierMap) {
        tierMap[row.tier as keyof typeof tierMap] = row.count;
      }
    }

    return {
      totalUsers: totalUsers ?? 0,
      totalTranscriptions: totalTranscriptions ?? 0,
      activeSubscriptions: tierMap,
    };
  }
}
