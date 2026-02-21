import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../lib/errors';
import { requireApiKeyId, requireUser, sendSuccess } from '../../lib/http';
import type { TranscriptionService } from './transcription.service';

export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  /**
   * POST /transcribe — Transcreve um arquivo de áudio enviado via multipart/form-data.
   * Requer autenticação por API key e subscription ativa.
   * Sujeito a rate limiting por tier.
   */
  async transcribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new ValidationError(
          'No audio file provided. Use multipart/form-data with field "audio".',
        );
      }

      const user = requireUser(req);
      const apiKeyId = requireApiKeyId(req);

      const result = await this.transcriptionService.transcribe(user, req.file, apiKeyId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
}
