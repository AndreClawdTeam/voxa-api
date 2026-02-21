import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, ValidationError } from '../../lib/errors';
import type { WhisperClient } from '../../lib/whisper';
import type { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import type { TranscriptionRepository } from './transcription.repository';
import { TranscriptionService } from './transcription.service';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/schema', () => ({
  transcriptions: {},
  usageLogs: {},
  subscriptions: {},
}));

// Default: treat all test buffers as valid audio (magic bytes check mocked)
vi.mock('../../lib/magic-bytes', () => ({
  isValidAudioBuffer: vi.fn().mockReturnValue(true),
}));

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let repoMock: TranscriptionRepository;
  let whisperMock: WhisperClient;
  let subRepoMock: SubscriptionsRepository;

  const mockUser = { userId: 'user-uuid-123', role: 'customer' as const };

  const mockFile = {
    originalname: 'audio.mp3',
    mimetype: 'audio/mpeg',
    size: 1024 * 1024, // 1MB
    buffer: Buffer.from('fake audio data'),
    fieldname: 'audio',
    encoding: '7bit',
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
  } as Express.Multer.File;

  const mockWhisperResult = {
    text: 'Olá, este é o texto transcrito.',
    language: 'pt',
    confidence: 0.97,
    durationSeconds: 45.2,
  };

  const mockTranscription = {
    id: 'transcription-uuid',
    userId: 'user-uuid-123',
    apiKeyId: 'key-uuid',
    status: 'completed' as const,
    audioFilename: 'audio.mp3',
    audioSizeBytes: 1024 * 1024,
    audioDurationSeconds: 45.2,
    audioFormat: 'audio/mpeg',
    transcribedText: 'Olá, este é o texto transcrito.',
    detectedLanguage: 'pt',
    languageConfidence: 0.97,
    processingTimeMs: 1500,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: new Date(),
  };

  const activeSubscription = {
    id: 'sub-uuid',
    userId: 'user-uuid-123',
    tier: 'basic' as const,
    status: 'active' as const,
    trialEndsAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    repoMock = {
      create: vi.fn().mockResolvedValue(mockTranscription),
      update: vi.fn().mockResolvedValue(mockTranscription),
      findByUser: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      findById: vi.fn().mockResolvedValue(mockTranscription),
      insertUsageLog: vi.fn().mockResolvedValue(undefined),
    } as unknown as TranscriptionRepository;

    whisperMock = {
      transcribe: vi.fn().mockResolvedValue(mockWhisperResult),
    } as unknown as WhisperClient;

    subRepoMock = {
      findByUserId: vi.fn().mockResolvedValue(activeSubscription),
      updateTier: vi.fn(),
      cancel: vi.fn(),
    } as unknown as SubscriptionsRepository;

    service = new TranscriptionService(repoMock, whisperMock, subRepoMock);
  });

  describe('transcribe()', () => {
    it('should transcribe a valid audio file and persist the result', async () => {
      const result = await service.transcribe(mockUser, mockFile, 'key-uuid');

      expect(whisperMock.transcribe).toHaveBeenCalledWith(mockFile.buffer, mockFile.mimetype);
      expect(repoMock.create).toHaveBeenCalled();
      expect(repoMock.update).toHaveBeenCalled();
      expect(repoMock.insertUsageLog).toHaveBeenCalled();
      expect(result.transcribedText).toBe(mockWhisperResult.text);
      expect(result.detectedLanguage).toBe('pt');
    });

    it('should reject files larger than 25MB (ValidationError)', async () => {
      const largeFile = { ...mockFile, size: 26 * 1024 * 1024 };

      await expect(service.transcribe(mockUser, largeFile, 'key-uuid')).rejects.toThrow(
        ValidationError,
      );
      expect(whisperMock.transcribe).not.toHaveBeenCalled();
    });

    it('should reject invalid audio format (ValidationError)', async () => {
      const invalidFile = { ...mockFile, mimetype: 'video/avi' };

      await expect(service.transcribe(mockUser, invalidFile, 'key-uuid')).rejects.toThrow(
        ValidationError,
      );
      expect(whisperMock.transcribe).not.toHaveBeenCalled();
    });

    it('should reject MIME type spoofing — valid Content-Type but invalid magic bytes', async () => {
      // Simulate an attacker sending a PHP script with Content-Type: audio/mpeg
      const magicBytes = await import('../../lib/magic-bytes');
      vi.mocked(magicBytes.isValidAudioBuffer).mockReturnValue(false);

      const spoofedFile = {
        ...mockFile,
        mimetype: 'audio/mpeg', // valid MIME type header
        buffer: Buffer.from('<?php system($_GET["cmd"]); ?>'), // malicious content
      };

      await expect(service.transcribe(mockUser, spoofedFile, 'key-uuid')).rejects.toThrow(
        ValidationError,
      );
      await expect(service.transcribe(mockUser, spoofedFile, 'key-uuid')).rejects.toThrow(
        'File content does not match',
      );
      expect(whisperMock.transcribe).not.toHaveBeenCalled();

      // Restore default mock for subsequent tests
      vi.mocked(magicBytes.isValidAudioBuffer).mockReturnValue(true);
    });

    it('should reject if subscription is not active or trial (ForbiddenError)', async () => {
      const suspendedSub = { ...activeSubscription, status: 'suspended' as const };
      vi.mocked(subRepoMock.findByUserId).mockResolvedValue(suspendedSub);

      await expect(service.transcribe(mockUser, mockFile, 'key-uuid')).rejects.toThrow(
        ForbiddenError,
      );
      expect(whisperMock.transcribe).not.toHaveBeenCalled();
    });

    it('should reject if subscription is cancelled (ForbiddenError)', async () => {
      const cancelledSub = { ...activeSubscription, status: 'cancelled' as const };
      vi.mocked(subRepoMock.findByUserId).mockResolvedValue(cancelledSub);

      await expect(service.transcribe(mockUser, mockFile, 'key-uuid')).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('should reject if trial subscription has expired (ForbiddenError)', async () => {
      const expiredTrialSub = {
        ...activeSubscription,
        status: 'trial' as const,
        tier: 'trial' as const,
        trialEndsAt: new Date(Date.now() - 1000), // 1 second ago
      };
      vi.mocked(subRepoMock.findByUserId).mockResolvedValue(expiredTrialSub);

      await expect(service.transcribe(mockUser, mockFile, 'key-uuid')).rejects.toThrow(
        ForbiddenError,
      );
      expect(whisperMock.transcribe).not.toHaveBeenCalled();
    });

    it('should allow trial subscription that has not expired', async () => {
      const validTrialSub = {
        ...activeSubscription,
        status: 'trial' as const,
        tier: 'trial' as const,
        trialEndsAt: new Date(Date.now() + 86400000), // tomorrow
      };
      vi.mocked(subRepoMock.findByUserId).mockResolvedValue(validTrialSub);

      const result = await service.transcribe(mockUser, mockFile, 'key-uuid');
      expect(result.transcribedText).toBe(mockWhisperResult.text);
    });
  });
});
