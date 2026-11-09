import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { AIProviderError, DEFAULT_MODELS, generateWithProvider, getProviderCatalog, getProviderAdapter } from '../lib/ai-providers';

afterEach(() => vi.unstubAllGlobals());

describe('AI provider adapters', () => {
  it('exposes the four supported providers and default model ids', () => {
    expect(DEFAULT_MODELS.gemini).toBe('gemini-3.8-flash');
    expect(getProviderCatalog().map(entry => entry.provider)).toEqual(['gemini', 'openai', 'anthropic', 'openrouter']);
  });

  it.each([
    ['openai', { choices: [{ message: { content: 'OpenAI OK' } }], usage: { prompt_tokens: 2 } }, 'https://api.openai.com/v1/chat/completions'],
    ['anthropic', { content: [{ type: 'text', text: 'Anthropic OK' }], usage: { input_tokens: 2 } }, 'https://api.anthropic.com/v1/messages'],
    ['openrouter', { choices: [{ message: { content: 'OpenRouter OK' } }], usage: { total_tokens: 3 } }, 'https://openrouter.ai/api/v1/chat/completions'],
  ] as const)('calls the %s adapter and parses its response', async (provider, payload, url) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getProviderAdapter(provider).generateText({ apiKey: 'test-secret', model: 'test-model', system: 'system', prompt: 'prompt' });
    expect(result.text).toBe(`${provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'OpenRouter'} OK`);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'POST' }));
  });

  it('maps provider errors to safe diagnostics without exposing response bodies or keys', async () => {
    const secret = 'never-show-this-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: `Model not found; api key ${secret}` } }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const error = await generateWithProvider({ provider: 'gemini', model: 'bad-model', apiKey: secret, system: 'test', prompt: 'test' }).catch(reason => reason);
    expect(error).toMatchObject({ code: 'model_not_found' } satisfies Partial<AIProviderError>);
    expect(error instanceof Error ? error.message : '').not.toContain(secret);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1beta/models/bad-model:generateContent'), expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': secret }) }));
  });
});
