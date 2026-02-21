/**
 * Magic-bytes MIME type validation for audio files.
 *
 * Validates file content by inspecting the actual binary header (magic bytes)
 * rather than trusting the client-supplied Content-Type header or filename
 * extension. This prevents MIME type spoofing attacks where a malicious file
 * is disguised as an audio file.
 */

type AudioMimeType =
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/ogg'
  | 'audio/mp4'
  | 'audio/x-m4a'
  | 'audio/flac'
  | 'audio/webm'
  | 'video/webm';

/**
 * Returns true if the buffer's magic bytes match one of the supported audio formats.
 * Returns the detected MIME type, or null if the content is unrecognised.
 */
export function detectAudioMimeType(buffer: Buffer): AudioMimeType | null {
  if (buffer.length < 12) return null;

  // MP3 — ID3 tag header
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio/mpeg';
  }

  // MP3 — raw MPEG frame sync (FF FB, FF F3, FF F2, FF FA, FF F0)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  // WAV — RIFF....WAVE
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x41 && // A
    buffer[10] === 0x56 && // V
    buffer[11] === 0x45 // E
  ) {
    return 'audio/wav';
  }

  // OGG — OggS
  if (
    buffer[0] === 0x4f && // O
    buffer[1] === 0x67 && // g
    buffer[2] === 0x67 && // g
    buffer[3] === 0x53 // S
  ) {
    return 'audio/ogg';
  }

  // FLAC — fLaC
  if (
    buffer[0] === 0x66 && // f
    buffer[1] === 0x4c && // L
    buffer[2] === 0x61 && // a
    buffer[3] === 0x43 // C
  ) {
    return 'audio/flac';
  }

  // WEBM / MKV — EBML
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'audio/webm';
  }

  // MP4 / M4A — ftyp box at offset 4
  if (
    buffer[4] === 0x66 && // f
    buffer[5] === 0x74 && // t
    buffer[6] === 0x79 && // y
    buffer[7] === 0x70 // p
  ) {
    return 'audio/mp4';
  }

  return null;
}

/**
 * Validates that the buffer's actual magic bytes correspond to a recognised
 * audio format, regardless of the claimed MIME type in the Content-Type header.
 *
 * @returns true if the content looks like valid audio
 */
export function isValidAudioBuffer(buffer: Buffer): boolean {
  return detectAudioMimeType(buffer) !== null;
}
