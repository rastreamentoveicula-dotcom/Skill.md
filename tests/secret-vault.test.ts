import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { decryptSecret, encryptSecret } from '../lib/secret-vault';

describe('encrypted server-side credentials', () => {
  const originalKey = process.env.AI_SECRETS_ENCRYPTION_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.AI_SECRETS_ENCRYPTION_KEY;
    else process.env.AI_SECRETS_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips with authenticated AES-256-GCM and does not store plaintext', () => {
    process.env.AI_SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const secret = 'private-api-token-123';
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it('rejects tampering and invalid key lengths', () => {
    process.env.AI_SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const encrypted = encryptSecret('do-not-leak');
    const parts = encrypted.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
    process.env.AI_SECRETS_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(() => encryptSecret('token')).toThrow(/32-byte/);
  });
});
