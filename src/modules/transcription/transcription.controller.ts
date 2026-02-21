import type { NextFunction, Request, Response } from 'express';
import { ValidationError } from '../../lib/errors';
import type { ApiKeyAuthenticatedRequest } from '../../middleware/authenticate-api-key';
import type { TranscriptionService } from './transcription.service';

export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  async transcribe(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as ApiKeyAuthenticatedRequest;

      if (!req.file) {
        throw new ValidationError(
          'No audio file provided. Use multipart/form-data with field "audio".',
        );
      }

      const result = await this.transcriptionService.transcribe(
        authReq.user,
        req.file,
        authReq.apiKeyId,
      );

      return res.status(200).json({ data: result });
    } catch (error) {
      return next(error);
    }
  }
}
