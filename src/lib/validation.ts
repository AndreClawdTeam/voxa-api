import type { Request } from 'express';
import { type ZodTypeAny, z } from 'zod';
import { ValidationError } from './errors';

/**
 * Extrai a primeira mensagem de erro de um resultado Zod inválido.
 *
 * @param error - Objeto ZodError retornado por `.safeParse()`
 * @returns Mensagem de erro amigável para o cliente
 */
function firstZodMessage(error: { errors: Array<{ message: string }> }): string {
  return error.errors[0]?.message ?? 'Validation failed';
}

/**
 * Valida `req.body` com o schema Zod informado.
 * Lança `ValidationError` se a validação falhar.
 *
 * Usa genérico `S extends ZodTypeAny` para suportar schemas com `.transform()`
 * (onde tipos de entrada e saída diferem).
 *
 * @param schema - Schema Zod para validação
 * @param req - Objeto de requisição do Express
 * @returns Dados validados e tipados conforme output do schema
 * @throws {ValidationError} Se `req.body` não satisfaz o schema
 */
export function parseBody<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(firstZodMessage(parsed.error));
  }
  return parsed.data;
}

/**
 * Valida `req.query` com o schema Zod informado.
 * Lança `ValidationError` se a validação falhar.
 *
 * Usa genérico `S extends ZodTypeAny` para suportar schemas com `.transform()`
 * (onde tipos de entrada e saída diferem, como paginação string→number).
 *
 * @param schema - Schema Zod para validação
 * @param req - Objeto de requisição do Express
 * @returns Dados validados e tipados conforme output do schema
 * @throws {ValidationError} Se `req.query` não satisfaz o schema
 */
export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    throw new ValidationError(firstZodMessage(parsed.error));
  }
  return parsed.data;
}

/**
 * Valida `req.params` com o schema Zod informado.
 * Lança `ValidationError` se a validação falhar.
 *
 * @param schema - Schema Zod para validação
 * @param req - Objeto de requisição do Express
 * @returns Dados validados e tipados conforme output do schema
 * @throws {ValidationError} Se `req.params` não satisfaz o schema
 */
export function parseParams<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) {
    throw new ValidationError(firstZodMessage(parsed.error));
  }
  return parsed.data;
}

/**
 * Schema Zod compartilhado para parâmetros de paginação em query strings.
 *
 * Aceita `page` e `limit` como strings (vindos da query) e transforma em números.
 * Limita `limit` a no máximo 100 itens por página.
 *
 * @example
 * const { page, limit } = parseQuery(paginationSchema, req);
 */
export const paginationSchema = z.object({
  page: z.string().transform(Number).pipe(z.number().int().positive()).default('1'),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).default('20'),
});

/**
 * Schema Zod para paginação com campo de busca opcional.
 *
 * Extende `paginationSchema` com `search?: string` para listagens com filtro.
 *
 * @example
 * const { page, limit, search } = parseQuery(paginationWithSearchSchema, req);
 */
export const paginationWithSearchSchema = paginationSchema.extend({
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
export type PaginationWithSearchQuery = z.infer<typeof paginationWithSearchSchema>;
