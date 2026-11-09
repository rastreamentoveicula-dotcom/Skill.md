import 'server-only';

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  openrouter: 'openai/gpt-4o-mini',
};

export async function generateWithProvider(input: {
  provider: AIProvider;
  model: string;
  apiKey: string;
  system: string;
  prompt: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    if (input.provider === 'gemini') {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      });
    } else if (input.provider === 'anthropic') {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' },
        signal: controller.signal,
        body: JSON.stringify({ model: input.model, system: input.system, max_tokens: 1000, messages: [{ role: 'user', content: input.prompt }] }),
      });
    } else {
      const base = input.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}`, ...(input.provider === 'openrouter' ? { 'HTTP-Referer': process.env.APP_URL || 'https://motion-system-eta.vercel.app', 'X-Title': 'Recriar Motion AI' } : {}) },
        signal: controller.signal,
        body: JSON.stringify({ model: input.model, temperature: 0.7, max_tokens: 1000, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.prompt }] }),
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('A chave ou as permissões desse provedor foram recusadas.');
    if (response.status === 429) throw new Error('O limite de uso do provedor foi atingido.');
    throw new Error(`O provedor de IA respondeu com HTTP ${response.status}.`);
  }
  const result = await response.json();
  const text = input.provider === 'gemini'
    ? result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('').trim()
    : input.provider === 'anthropic'
      ? result?.content?.map((part: { text?: string }) => part.text ?? '').join('').trim()
      : result?.choices?.[0]?.message?.content?.trim();
  if (typeof text !== 'string' || !text) throw new Error('O provedor retornou uma resposta vazia.');
  return { text, usage: result?.usage ?? null };
}
