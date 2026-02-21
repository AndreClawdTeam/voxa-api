import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { env } from '../config/env';

export interface WhisperResult {
  text: string;
  language: string;
  confidence: number;
  durationSeconds: number;
}

export class WhisperClient {
  async transcribe(buffer: Buffer, mimetype: string): Promise<WhisperResult> {
    const ext = this.getExtension(mimetype);
    const tmpPath = path.join(os.tmpdir(), `voxa_${Date.now()}.${ext}`);
    await fs.promises.writeFile(tmpPath, buffer);

    try {
      const result = await this.runWhisper(tmpPath);
      return result;
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  private async runWhisper(filePath: string): Promise<WhisperResult> {
    return new Promise((resolve, reject) => {
      const script = `
import json, sys
from faster_whisper import WhisperModel
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("${filePath}", beam_size=5)
text = " ".join(s.text.strip() for s in segments)
print(json.dumps({"text": text, "language": info.language, "confidence": float(info.language_probability), "durationSeconds": float(info.duration)}))
`;
      const proc = spawn(env.WHISPER_PYTHON, ['-c', script]);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => {
        stdout += d;
      });
      proc.stderr.on('data', (d) => {
        stderr += d;
      });
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`Whisper failed: ${stderr}`));
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`Invalid whisper output: ${stdout}`));
        }
      });
    });
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/mp4': 'mp4',
      'audio/x-m4a': 'm4a',
      'audio/flac': 'flac',
      'audio/webm': 'webm',
      'video/webm': 'webm',
    };
    return map[mimetype] ?? 'mp3';
  }
}
