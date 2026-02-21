import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { env } from '../config/env';

/** Resultado retornado pelo faster-whisper após transcrição. */
export interface WhisperResult {
  text: string;
  language: string;
  confidence: number;
  durationSeconds: number;
}

/**
 * Cliente para transcrição de áudio usando o faster-whisper (modelo `small`, CPU).
 *
 * Escreve o buffer de áudio em um arquivo temporário, executa o Python com o script
 * do faster-whisper passando o caminho como argumento (não interpolado no script —
 * prevenção de code injection), e remove o arquivo ao terminar.
 */
export class WhisperClient {
  /**
   * Transcreve um buffer de áudio.
   *
   * @param buffer - Buffer binário do arquivo de áudio
   * @param mimetype - MIME type do áudio (usado para determinar a extensão do arquivo temporário)
   * @returns Resultado da transcrição com texto, idioma, confiança e duração
   * @throws {Error} Se o processo Whisper falhar ou retornar output inválido
   */
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

  /**
   * Executa o script Python do faster-whisper em um processo filho.
   *
   * O caminho do arquivo é passado como `sys.argv[1]` — nunca interpolado no código Python.
   * Isso previne injeção de código caso o caminho contenha caracteres especiais.
   *
   * @param filePath - Caminho absoluto do arquivo de áudio temporário
   * @returns Resultado da transcrição parseado do JSON produzido pelo script
   * @throws {Error} Se o processo falhar (exit code ≠ 0) ou o output não for JSON válido
   */
  private async runWhisper(filePath: string): Promise<WhisperResult> {
    return new Promise((resolve, reject) => {
      // SECURITY: filePath is passed as sys.argv[1] — NOT interpolated into the script string.
      // Interpolating user-controlled (or even system-generated) paths into Python source code
      // is a code injection pattern. Passing it as an argument is the safe approach.
      const script = `
import json, sys
from faster_whisper import WhisperModel
audio_path = sys.argv[1]
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(audio_path, beam_size=5)
text = " ".join(s.text.strip() for s in segments)
print(json.dumps({"text": text, "language": info.language, "confidence": float(info.language_probability), "durationSeconds": float(info.duration)}))
`;
      const proc = spawn(env.WHISPER_PYTHON, ['-c', script, filePath]);
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

  /**
   * Mapeia um MIME type para a extensão de arquivo correspondente.
   * Usado para nomear o arquivo temporário gravado antes de chamar o Whisper.
   *
   * @param mimetype - MIME type do áudio
   * @returns Extensão de arquivo (sem ponto), ex.: `'mp3'`, `'wav'`
   */
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
