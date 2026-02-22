import * as http from 'node:http';
import { z } from 'zod';
import { env } from '../config/env';
import { TranscriptionError } from './errors';
import { logger } from './logger';

/** Resultado retornado pelo servidor Whisper após transcrição. */
export interface WhisperResult {
  text: string;
  language: string;
  confidence: number;
  durationSeconds: number;
}

/**
 * Schema Zod para validação em runtime da resposta do servidor Whisper HTTP
 * (compatível com Deepgram).
 * @internal
 */
const WhisperAlternativeSchema = z.object({
  transcript: z.string(),
  confidence: z.number(),
});

const WhisperServerResponseSchema = z.object({
  results: z.object({
    channels: z.array(
      z.object({
        alternatives: z.array(WhisperAlternativeSchema),
      }),
    ),
  }),
});

type WhisperServerResponse = z.infer<typeof WhisperServerResponseSchema>;

/**
 * Cliente para transcrição de áudio usando o servidor Whisper HTTP
 * (`http://127.0.0.1:8765/v1/listen` — faster-whisper, modelo `small`, CPU).
 *
 * Em vez de spawnar Python diretamente (que exigiria o virtualenv correto),
 * delega ao servidor HTTP que já está em execução com o ambiente configurado.
 *
 * Interface pública mantida idêntica para não quebrar o `TranscriptionService`.
 */
export class WhisperClient {
  /**
   * Transcreve um buffer de áudio chamando o servidor Whisper HTTP.
   *
   * @param buffer - Buffer binário do arquivo de áudio
   * @param mimetype - MIME type do áudio (enviado como Content-Type ao servidor)
   * @returns Resultado da transcrição com texto, idioma, confiança e duração
   * @throws {TranscriptionError} Se o servidor Whisper estiver indisponível ou retornar erro
   */
  async transcribe(buffer: Buffer, mimetype: string): Promise<WhisperResult> {
    const raw = await this.callWhisperServer(buffer, mimetype);

    let jsonData: unknown;
    try {
      jsonData = JSON.parse(raw);
    } catch (err) {
      logger.error({ err }, 'Whisper server returned invalid JSON');
      throw new TranscriptionError(`Whisper server returned invalid JSON: ${raw.slice(0, 200)}`);
    }

    const parseResult = WhisperServerResponseSchema.safeParse(jsonData);
    if (!parseResult.success) {
      logger.error(
        { err: parseResult.error },
        'Whisper server response did not match expected schema',
      );
      throw new TranscriptionError('Whisper server returned unexpected response shape');
    }

    const alternative = parseResult.data.results.channels[0]?.alternatives[0];
    if (!alternative) {
      throw new TranscriptionError('Whisper server returned empty transcription');
    }

    return {
      text: alternative.transcript,
      language: 'pt-br',
      confidence: alternative.confidence,
      durationSeconds: 0, // HTTP server does not return duration — informational field only
    };
  }

  /**
   * Faz a requisição HTTP ao servidor Whisper e retorna o body bruto.
   *
   * @param buffer - Bytes do arquivo de áudio
   * @param mimetype - Content-Type a ser enviado ao servidor
   * @returns Body da resposta como string JSON
   * @throws {TranscriptionError} Se o servidor retornar status ≠ 200 ou não estiver acessível
   */
  private callWhisperServer(buffer: Buffer, mimetype: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL('/v1/listen', env.WHISPER_URL);
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: Number(url.port) || 8765,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': mimetype,
          'Content-Length': buffer.length,
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer | string) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new TranscriptionError(
                `Whisper server returned HTTP ${res.statusCode}: ${data.slice(0, 200)}`,
              ),
            );
            return;
          }
          resolve(data);
        });
      });

      req.on('error', (err: Error) => {
        reject(new TranscriptionError(`Whisper server unreachable: ${err.message}`));
      });

      req.write(buffer);
      req.end();
    });
  }
}
