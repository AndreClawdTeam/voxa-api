import { Router } from 'express';
import multer from 'multer';
import { WhisperClient } from '../../lib/whisper';
import { createAuthenticateApiKey } from '../../middleware/authenticate-api-key';
import { createTierRateLimit } from '../../middleware/rate-limit-by-tier';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
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

const authenticateApiKey = createAuthenticateApiKey({
  apiKeysRepo: new ApiKeysRepository(),
  subscriptionsRepo,
});

const tierRateLimit = createTierRateLimit();

export const transcriptionRouter = Router();

/**
 * @swagger
 * tags:
 *   name: Transcription
 *   description: Audio transcription via faster-whisper
 */

/**
 * @swagger
 * /transcribe:
 *   post:
 *     tags: [Transcription]
 *     summary: Transcribe an audio file
 *     description: |
 *       Upload an audio file for transcription using faster-whisper.
 *       Requires a valid API key. Subject to rate limits based on subscription tier:
 *       - trial: 20 req/min
 *       - basic: 60 req/min
 *       - pro: 300 req/min
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - audio
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file (MP3, WAV, OGG, MP4/M4A, FLAC, WEBM — max 25MB)
 *     responses:
 *       200:
 *         description: Transcription completed
 *         headers:
 *           X-RateLimit-Limit:
 *             schema:
 *               type: integer
 *             description: Rate limit for the current tier
 *           X-RateLimit-Remaining:
 *             schema:
 *               type: integer
 *             description: Remaining requests in current window
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     text:
 *                       type: string
 *                     language:
 *                       type: string
 *                     processingTimeMs:
 *                       type: integer
 *       400:
 *         description: Invalid file format or file too large
 *       401:
 *         description: Invalid or missing API key
 *       403:
 *         description: Subscription not active or trial expired
 *       429:
 *         description: Rate limit exceeded
 */
transcriptionRouter.post(
  '/',
  authenticateApiKey,
  tierRateLimit,
  upload.single('audio'),
  controller.transcribe.bind(controller),
);
