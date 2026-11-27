import { describe, expect, it } from 'vitest';
import { loginSchema } from './loginSchema';

describe('loginSchema', () => {
  it('accepts a valid login payload', () => {
    const result = loginSchema.safeParse({
      organization_code: 'PHARMAPLUS',
      username: 'fa.pharmacist',
      password: 'password123',
    });

    expect(result.success).toBe(true);
  });

  it('requires all fields', () => {
    const result = loginSchema.safeParse({
      organization_code: '',
      username: '',
      password: '',
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Organization code is required');
      expect(messages).toContain('Username is required');
      expect(messages).toContain('Password is required');
    }
  });

  it('trims organization code and username but not the password', () => {
    const result = loginSchema.parse({
      organization_code: '  PHARMAPLUS  ',
      username: '  fa.pharmacist  ',
      password: ' password123 ',
    });

    expect(result.organization_code).toBe('PHARMAPLUS');
    expect(result.username).toBe('fa.pharmacist');
    expect(result.password).toBe(' password123 ');
  });

  it('rejects organization_code and username above the contract limits', () => {
    const result = loginSchema.safeParse({
      organization_code: 'o'.repeat(31),
      username: 'u'.repeat(81),
      password: 'password123',
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        'Organization code must be 30 characters or fewer'
      );
      expect(messages).toContain('Username must be 80 characters or fewer');
    }
  });

  it('accepts a 129-character password without an undocumented max length cap', () => {
    const longPassword = 'p'.repeat(129);
    const result = loginSchema.safeParse({
      organization_code: 'PHARMAPLUS',
      username: 'fa.pharmacist',
      password: longPassword,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.password).toBe(longPassword);
    }
  });
});
