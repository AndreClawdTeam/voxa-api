import { Router } from 'express';
import multer from 'multer';
import { WhisperClient } from '../../lib/whisper';
import { authenticateApiKey } from '../../middleware/authenticate-api-key';
import { createTierRateLimit } from '../../middleware/rate-limit-by-tier';
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionRepository } from './transcription.repository';
import { TranscriptionService } from './transcription.service';

const ALLOWED_MIMETYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/flac',
  'audio/webm',
  'video/webm',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

const transcriptionRepo = new TranscriptionRepository();
const whisperClient = new WhisperClient();
const subscriptionsRepo = new SubscriptionsRepository();
const service = new TranscriptionService(transcriptionRepo, whisperClient, subscriptionsRepo);
const controller = new TranscriptionController(service);

const tierRateLimit = createTierRateLimit();

export const transcriptionRouter = Router();

transcriptionRouter.post(
  '/',
  authenticateApiKey,
  tierRateLimit,
  upload.single('audio'),
  controller.transcribe.bind(controller),
);
