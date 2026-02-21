import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  type NewSubscription,
  type NewUser,
  type User,
  subscriptions,
  users,
} from '../../db/schema';

export class AuthRepository {
  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async create(data: NewUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async createSubscription(data: NewSubscription) {
    const [subscription] = await db.insert(subscriptions).values(data).returning();
    return subscription;
  }
}
