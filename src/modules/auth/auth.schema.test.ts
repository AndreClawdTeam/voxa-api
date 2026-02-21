import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './auth.schema';

describe('registerSchema', () => {
  it('should accept a valid password (8–72 chars)', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject a password longer than 72 chars (bcrypt truncation risk)', () => {
    // bcrypt silently truncates at 72 bytes — passwords > 72 chars provide false security
    const longPassword = 'a'.repeat(73);
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: longPassword,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/too_big|string must contain at most/i);
    }
  });

  it('should reject a password with exactly 73 chars', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'a'.repeat(73),
    });
    expect(result.success).toBe(false);
  });

  it('should accept a password with exactly 72 chars (bcrypt limit)', () => {
    const result = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'a'.repeat(72),
    });
    expect(result.success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('should accept valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});
