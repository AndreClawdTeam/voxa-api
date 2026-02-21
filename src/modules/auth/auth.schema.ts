import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  // bcrypt silently truncates at 72 bytes — reject anything longer to prevent false sense of security
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
