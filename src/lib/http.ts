import type { Request, Response } from 'express';
import { UnauthorizedError } from './errors';

// ─── Request helpers ─────────────────────────────────────────────────────────

/**
 * Extrai e garante o usuário autenticado de `req.user`.
 *
 * Deve ser chamado em controllers protegidos pelo middleware `authenticate` ou
 * `authenticateApiKey`. Lança `UnauthorizedError` caso o usuário não esteja injetado
 * (situação que nunca deveria ocorrer em rotas protegidas, mas cobre casos de má configuração).
 *
 * @param req - Objeto de requisição do Express
 * @returns Usuário autenticado `{ userId, role }`
 * @throws {UnauthorizedError} Se `req.user` não estiver definido
 */
export function requireUser(req: Request): { userId: string; role: string } {
  if (!req.user) throw new UnauthorizedError('Authentication required');
  return req.user;
}

/**
 * Extrai e garante o `apiKeyId` injetado por `authenticateApiKey`.
 *
 * @param req - Objeto de requisição do Express
 * @returns ID da API key autenticada
 * @throws {UnauthorizedError} Se `req.apiKeyId` não estiver definido
 */
export function requireApiKeyId(req: Request): string {
  if (!req.apiKeyId) throw new UnauthorizedError('Authentication required');
  return req.apiKeyId;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/**
 * Metadados de paginação incluídos nas respostas paginadas.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Envia uma resposta 200 OK com envelope `{ data }`.
 *
 * @param res - Objeto de resposta do Express
 * @param data - Dados a incluir no envelope
 */
export function sendSuccess<T>(res: Response, data: T): void {
  res.status(200).json({ data });
}

/**
 * Envia uma resposta 200 OK com envelope `{ data, message }`.
 *
 * @param res - Objeto de resposta do Express
 * @param data - Dados a incluir no envelope
 * @param message - Mensagem descritiva da operação
 */
export function sendSuccessWithMessage<T>(res: Response, data: T, message: string): void {
  res.status(200).json({ data, message });
}

/**
 * Envia uma resposta 201 Created com envelope `{ data }` e mensagem opcional.
 *
 * @param res - Objeto de resposta do Express
 * @param data - Recurso criado
 * @param message - Mensagem opcional (ex.: instruções para o cliente)
 */
export function sendCreated<T>(res: Response, data: T, message?: string): void {
  const body: { data: T; message?: string } = { data };
  if (message) body.message = message;
  res.status(201).json(body);
}

/**
 * Envia uma resposta paginada 200 OK com envelope `{ data, pagination }`.
 *
 * @param res - Objeto de resposta do Express
 * @param data - Array de itens da página atual
 * @param pagination - Metadados de paginação
 */
export function sendPaginated<T>(res: Response, data: T[], pagination: PaginationMeta): void {
  res.status(200).json({ data, pagination });
}

/**
 * Envia uma resposta 204 No Content (sem corpo).
 *
 * @param res - Objeto de resposta do Express
 */
export function sendEmpty(res: Response): void {
  res.status(204).send();
}
