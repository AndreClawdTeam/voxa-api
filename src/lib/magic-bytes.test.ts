import { describe, expect, it } from 'vitest';
import { detectAudioMimeType, isValidAudioBuffer } from './magic-bytes';

function makeBuffer(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

describe('detectAudioMimeType', () => {
  it('should detect MP3 via ID3 header', () => {
    // ID3v2 tag: 0x49 0x44 0x33
    const buf = makeBuffer(0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(detectAudioMimeType(buf)).toBe('audio/mpeg');
  });

  it('should detect MP3 via raw MPEG frame sync (FF FB)', () => {
    const buf = makeBuffer(0xff, 0xfb, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(detectAudioMimeType(buf)).toBe('audio/mpeg');
  });

  it('should detect WAV via RIFF....WAVE header', () => {
    // RIFF at 0-3, WAVE at 8-11
    const buf = makeBuffer(
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // file size
      0x57,
      0x41,
      0x56,
      0x45, // WAVE
    );
    expect(detectAudioMimeType(buf)).toBe('audio/wav');
  });

  it('should detect OGG via OggS magic', () => {
    const buf = makeBuffer(0x4f, 0x67, 0x67, 0x53, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(detectAudioMimeType(buf)).toBe('audio/ogg');
  });

  it('should detect FLAC via fLaC magic', () => {
    const buf = makeBuffer(0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(detectAudioMimeType(buf)).toBe('audio/flac');
  });

  it('should detect WEBM via EBML magic', () => {
    const buf = makeBuffer(0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(detectAudioMimeType(buf)).toBe('audio/webm');
  });

  it('should detect MP4/M4A via ftyp box at offset 4', () => {
    const buf = makeBuffer(
      0x00,
      0x00,
      0x00,
      0x00, // box size
      0x66,
      0x74,
      0x79,
      0x70, // ftyp
      0x00,
      0x00,
      0x00,
      0x00,
    );
    expect(detectAudioMimeType(buf)).toBe('audio/mp4');
  });

  it('should return null for unknown content (e.g. disguised executable)', () => {
    // ELF magic bytes (Linux executable)
    const buf = makeBuffer(0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(detectAudioMimeType(buf)).toBeNull();
  });

  it('should return null for a PHP script disguised as audio', () => {
    const phpScript = Buffer.from('<?php system($_GET["cmd"]); ?>');
    // Pad to at least 12 bytes
    const buf = Buffer.concat([phpScript, Buffer.alloc(20)]);
    expect(detectAudioMimeType(buf)).toBeNull();
  });

  it('should return null for buffers shorter than 12 bytes', () => {
    expect(detectAudioMimeType(Buffer.from([0x49, 0x44, 0x33]))).toBeNull();
  });
});

describe('isValidAudioBuffer', () => {
  it('should return true for a valid audio buffer (MP3)', () => {
    const buf = makeBuffer(0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(isValidAudioBuffer(buf)).toBe(true);
  });

  it('should return false for a non-audio buffer (MIME spoofing)', () => {
    const fakeAudio = Buffer.from('This is not audio data at all, it is text content.');
    expect(isValidAudioBuffer(fakeAudio)).toBe(false);
  });
});
