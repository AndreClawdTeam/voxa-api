/**
 * Extensão global do namespace do Express para adicionar propriedades tipadas ao `Request`.
 *
 * Com essa declaração, `req.user`, `req.apiKeyId` e `req.subscription` estão
 * disponíveis diretamente em qualquer middleware ou controller sem necessidade
 * de type assertions (`as SomeType`).
 *
 * As propriedades são opcionais (`?`) por padrão — middlewares de autenticação
 * garantem que estão definidas antes de chegar nos handlers protegidos.
 */
declare global {
  namespace Express {
    interface Request {
      /** Usuário autenticado, injetado por `authenticate` ou `authenticateApiKey`. */
      user?: {
        userId: string;
        role: string;
      };

      /** ID da API key usada na requisição, injetado por `authenticateApiKey`. */
      apiKeyId?: string;

      /** Assinatura ativa do usuário, injetada por `authenticateApiKey`. */
      subscription?: {
        tier: 'trial' | 'basic' | 'pro';
        status: string;
      } | null;
    }
  }
}

export {};
