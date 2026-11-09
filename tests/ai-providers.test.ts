import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { DEFAULT_MODELS, generateWithProvider } from '../lib/ai-providers';

afterEach(() => vi.unstubAllGlobals());

describe('AI provider connection diagnostics', () => {
  it('defaults Gemini to the current stable Flash model', () => {
    expect(DEFAULT_MODELS.gemini).toBe('gemini-3.8-flash');
  });

  it('reports Gemini model/API errors clearly and redacts secrets', async () => {
    const secret = 'never-show-this-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Model not found; api key never-show-this-key' } }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateWithProvider({ provider: 'gemini', model: 'bad-model', apiKey: secret, system: 'test', prompt: 'test' }))
      .rejects.toThrow('Model not found; api key [chave ocultada]');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1beta/models/bad-model:generateContent'), expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': secret }) }));
  });
});
