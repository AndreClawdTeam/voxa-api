import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';

export function signAccessToken(payload: { userId: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function signRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): jwt.JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
