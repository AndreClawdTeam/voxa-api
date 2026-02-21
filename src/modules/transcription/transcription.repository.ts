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
  /**
   * Insere um novo registro de transcrição com status inicial (normalmente `processing`).
   *
   * @param data - Dados da transcrição a inserir
   * @returns Transcrição criada
   */
  async create(data: NewTranscription): Promise<Transcription> {
    const [transcription] = await db.insert(transcriptions).values(data).returning();
    return transcription;
  }

  /**
   * Atualiza parcialmente um registro de transcrição existente.
   * Usado para registrar o resultado do Whisper ou um erro de processamento.
   *
   * @param id - UUID da transcrição a atualizar
   * @param data - Campos a atualizar (status, texto, duração, etc.)
   * @returns Transcrição atualizada
   */
  async update(id: string, data: Partial<NewTranscription>): Promise<Transcription> {
    const [transcription] = await db
      .update(transcriptions)
      .set(data)
      .where(eq(transcriptions.id, id))
      .returning();
    return transcription;
  }

  /**
   * Lista transcrições do usuário, ordenadas por `createdAt` decrescente, paginadas.
   *
   * @param userId - ID do usuário
   * @param options - Paginação: `page` e `limit`
   * @returns `{ data, total }` com os itens da página e o total de registros
   */
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

  /**
   * Busca uma transcrição específica do usuário pelo UUID.
   * Garante que a transcrição pertence ao usuário via cláusula `AND`.
   *
   * @param id - UUID da transcrição
   * @param userId - ID do usuário (validação de ownership)
   * @returns Transcrição encontrada ou `undefined`
   */
  async findById(id: string, userId: string): Promise<Transcription | undefined> {
    const [transcription] = await db
      .select()
      .from(transcriptions)
      .where(and(eq(transcriptions.id, id), eq(transcriptions.userId, userId)))
      .limit(1);
    return transcription;
  }

  /**
   * Insere uma entrada no log de uso (para métricas e auditoria por API key).
   *
   * @param data - Dados do log de uso a inserir
   */
  async insertUsageLog(data: NewUsageLog): Promise<void> {
    await db.insert(usageLogs).values(data);
  }
}
