import { z } from 'zod';

/**
 * Schema Zod para cadastro de novo usuário.
 *
 * - `name`: entre 2 e 255 caracteres
 * - `email`: formato de email válido
 * - `password`: entre 8 e 72 caracteres
 *   (bcrypt trunca silenciosamente em 72 bytes — limitar aqui evita falsa sensação de segurança)
 */
export const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  // bcrypt silently truncates at 72 bytes — reject anything longer to prevent false sense of security
  password: z.string().min(8).max(72),
});

/**
 * Schema Zod para login com email e senha.
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Schema Zod para renovação de access token com refresh token.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
