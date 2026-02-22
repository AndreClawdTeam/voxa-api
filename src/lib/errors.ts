/**
 * Classe base para todos os erros operacionais da aplicação.
 * Estende `Error` com `statusCode` HTTP e `code` semântico.
 *
 * O error handler global em `app.ts` captura instâncias de `AppError`
 * e retorna `{ code, message }` com o status correto.
 */
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Erro de validação de entrada — 400 Bad Request.
 * Usado quando `req.body`, `req.query` ou `req.params` não satisfazem o schema.
 * O campo `errors` mapeia cada campo inválido à sua mensagem de erro.
 */
export class ValidationError extends AppError {
  public readonly errors: Record<string, string>;

  constructor(message: string, errors: Record<string, string> = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * Erro de autenticação — 401 Unauthorized.
 * Token JWT ausente, inválido, expirado ou revogado. API key inválida.
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Erro de autorização — 403 Forbidden.
 * Usuário autenticado, mas sem permissão para o recurso (ex.: não é admin).
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Recurso não encontrado — 404 Not Found.
 * Entidade buscada não existe no banco de dados.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Conflito de estado — 409 Conflict.
 * Email já cadastrado, tier já ativo, etc.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Rate limit excedido — 429 Too Many Requests.
 * Emitido pelo middleware `createTierRateLimit` quando o usuário ultrapassa o limite do tier.
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Erro de transcrição — 503 Service Unavailable.
 * O serviço Whisper está indisponível ou retornou resultado inválido.
 */
export class TranscriptionError extends AppError {
  constructor(message = 'Transcription service unavailable') {
    super(message, 503, 'TRANSCRIPTION_FAILED');
  }
}
