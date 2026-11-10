import { describe, expect, it } from 'vitest';

import { PayloadTooLargeError, readJsonLimited } from '../lib/read-json';

function request(body: string | null, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/test', { method: 'POST', body, headers });
}

describe('readJsonLimited', () => {
  it('faz o parse do corpo JSON', async () => {
    await expect(readJsonLimited(request('{"a":1}'))).resolves.toEqual({ a: 1 });
  });

  it('recusa corpos maiores que o limite declarado', async () => {
    await expect(readJsonLimited(request('{}', { 'content-length': '99999999' }))).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('recusa corpos maiores que o limite real', async () => {
    await expect(readJsonLimited(request('{"a":"payload-longo"}', { 'content-length': '0' }), 5)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('sinaliza corpo ausente como JSON inválido', async () => {
    await expect(readJsonLimited(request(null))).rejects.toBeInstanceOf(SyntaxError);
  });

  it('sinaliza JSON malformado', async () => {
    await expect(readJsonLimited(request('not-json'))).rejects.toBeInstanceOf(SyntaxError);
  });
});
