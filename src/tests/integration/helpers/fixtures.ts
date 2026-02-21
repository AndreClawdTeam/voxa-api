/**
 * Generates a silent WAV buffer (PCM 16-bit, 16kHz mono).
 * Used in transcription tests to send a valid audio file.
 *
 * @param durationSeconds - Duration of silence in seconds (default 1)
 */
export function createSilentWavBuffer(durationSeconds = 1): Buffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const fileSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize, 0);

  // RIFF chunk
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 4);
  buf.write('WAVE', 8, 'ascii');

  // fmt sub-chunk
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // sub-chunk size (PCM)
  buf.writeUInt16LE(1, 20); // audio format: PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28); // byte rate
  buf.writeUInt16LE((numChannels * bitsPerSample) / 8, 32); // block align
  buf.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  // silence = all zeros (already initialized by Buffer.alloc)

  return buf;
}

/** Returns a unique test email based on timestamp + random suffix. */
export function uniqueEmail(prefix = 'user'): string {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}-${suffix}@integration.test`;
}
