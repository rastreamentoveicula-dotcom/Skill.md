import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function hasValidEncryptionKey() {
  const encoded = process.env.AI_SECRETS_ENCRYPTION_KEY;
  return Boolean(encoded && Buffer.from(encoded, 'base64').length === 32);
}

function encryptionKey() {
  const encoded = process.env.AI_SECRETS_ENCRYPTION_KEY;
  if (!encoded) throw new Error('AI_SECRETS_ENCRYPTION_KEY is not configured');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('AI_SECRETS_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error('Unsupported encrypted secret format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encodedIv, 'base64'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, 'base64')), decipher.final()]).toString('utf8');
}
