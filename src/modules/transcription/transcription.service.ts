import { ForbiddenError, ValidationError } from '../../lib/errors';
import { isValidAudioBuffer } from '../../lib/magic-bytes';
import type { WhisperClient } from '../../lib/whisper';
import type { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import type { TranscriptionRepository } from './transcription.repository';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_MIMETYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/flac',
  'audio/webm',
  'video/webm',
]);

export class TranscriptionService {
  constructor(
    private readonly transcriptionRepo: TranscriptionRepository,
    private readonly whisperClient: WhisperClient,
    private readonly subscriptionsRepo: SubscriptionsRepository,
  ) {}

  /**
   * Transcreve um arquivo de áudio usando o faster-whisper.
   *
   * Realiza três camadas de validação antes de chamar o Whisper:
   * 1. Tamanho do arquivo (máx. 25 MB)
   * 2. Content-Type (MIME type no header da requisição)
   * 3. Magic bytes (conteúdo binário real — previne MIME spoofing)
   *
   * Após validar, verifica se a assinatura do usuário está ativa.
   * Cria um registro de transcrição com status `processing`, chama o Whisper,
   * atualiza o registro com o resultado e registra um usage log.
   *
   * @param user - Usuário autenticado (com `userId` e `role`)
   * @param file - Arquivo de áudio recebido via multipart (`req.file`)
   * @param apiKeyId - ID da API key usada para autenticar a requisição
   * @returns Registro de transcrição completo
   * @throws {ValidationError} Se o arquivo for muito grande, formato inválido ou conteúdo incorreto
   * @throws {ForbiddenError} Se a assinatura estiver inativa, cancelada ou trial expirado
   */
  async transcribe(
    user: { userId: string; role: string },
    file: Express.Multer.File,
    apiKeyId: string,
  ) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new ValidationError('File size exceeds 25MB limit');
    }

    // Validate file format (Content-Type header check — first layer)
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new ValidationError(
        `Unsupported audio format: ${file.mimetype}. Allowed: MP3, WAV, OGG, MP4, FLAC, WEBM`,
      );
    }

    // Validate actual file content via magic bytes (second layer — prevents MIME spoofing).
    // A client can send Content-Type: audio/mpeg with a PHP script or ELF binary in the body.
    // Magic bytes look at the actual binary header of the file, independent of any header.
    if (!isValidAudioBuffer(file.buffer)) {
      throw new ValidationError(
        'File content does not match a recognised audio format. Upload a valid audio file.',
      );
    }

    // Validate subscription
    const subscription = await this.subscriptionsRepo.findByUserId(user.userId);
    if (!subscription) {
      throw new ForbiddenError('No active subscription found');
    }

    if (subscription.status === 'active') {
      // Active subscription — allowed
    } else if (subscription.status === 'trial') {
      // Check trial expiry
      if (!subscription.trialEndsAt || subscription.trialEndsAt <= new Date()) {
        throw new ForbiddenError('Trial has expired. Please upgrade your plan to continue.');
      }
    } else {
      throw new ForbiddenError(
        'Subscription is not active. Please upgrade or reactivate your plan.',
      );
    }

    const startTime = Date.now();

    // Create record with processing status
    const transcription = await this.transcriptionRepo.create({
      userId: user.userId,
      apiKeyId,
      status: 'processing',
      audioFilename: file.originalname,
      audioSizeBytes: file.size,
      audioFormat: file.mimetype,
    });

    try {
      // Run whisper
      const result = await this.whisperClient.transcribe(file.buffer, file.mimetype);
      const processingTimeMs = Date.now() - startTime;

      // Update transcription with result
      const completed = await this.transcriptionRepo.update(transcription.id, {
        status: 'completed',
        transcribedText: result.text,
        detectedLanguage: result.language,
        languageConfidence: result.confidence,
        audioDurationSeconds: result.durationSeconds,
        processingTimeMs,
        completedAt: new Date(),
      });

      // Insert usage log
      await this.transcriptionRepo.insertUsageLog({
        userId: user.userId,
        apiKeyId,
        transcriptionId: transcription.id,
        endpoint: '/api/v1/transcribe',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: processingTimeMs,
      });

      return completed;
    } catch (error) {
      // Update transcription with error status before rethrowing
      await this.transcriptionRepo.update(transcription.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
