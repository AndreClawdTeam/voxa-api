import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  type NewTranscription,
  type NewUsageLog,
  type Transcription,
  transcriptions,
  usageLogs,
} from '../../db/schema';

export class TranscriptionRepository {
  async create(data: NewTranscription): Promise<Transcription> {
    const [transcription] = await db.insert(transcriptions).values(data).returning();
    return transcription;
  }

  async update(id: string, data: Partial<NewTranscription>): Promise<Transcription> {
    const [transcription] = await db
      .update(transcriptions)
      .set(data)
      .where(eq(transcriptions.id, id))
      .returning();
    return transcription;
  }

  async findByUser(
    userId: string,
    options: { page: number; limit: number },
  ): Promise<{ data: Transcription[]; total: number }> {
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

    return { data, total: count };
  }

  async findById(id: string, userId: string): Promise<Transcription | undefined> {
    const [transcription] = await db
      .select()
      .from(transcriptions)
      .where(and(eq(transcriptions.id, id), eq(transcriptions.userId, userId)))
      .limit(1);
    return transcription;
  }

  async insertUsageLog(data: NewUsageLog): Promise<void> {
    await db.insert(usageLogs).values(data);
  }
}
