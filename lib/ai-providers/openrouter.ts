import 'server-only';
import { type AIProviderAdapter, type ModelInfo } from './types';
import { asArray, asObject, asString, ensureResponseText, fetchJson, modelCapability, parseDataUrl } from './shared';

const endpoint = 'https://openrouter.ai/api/v1';
const authHeaders = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.APP_URL || 'https://motion-system-eta.vercel.app', 'X-Title': 'Recriar Motion AI' });

export const openrouterAdapter: AIProviderAdapter = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  defaultModel: 'openai/gpt-4o-mini',
  async listModels(apiKey) {
    const { body } = await fetchJson(`${endpoint}/models`, { headers: authHeaders(apiKey) }, 'OpenRouter');
    return asArray(body.data).map(entry => {
      const model = asObject(entry);
      const architecture = asObject(model.architecture);
      const modalities = asArray(architecture.input_modalities);
      const id = asString(model.id);
      return {
        id,
        displayName: asString(model.name, id),
        capabilities: { text: modalities.length === 0 || modalities.includes('text'), image: modelCapability(modalities.includes('image')), video: modelCapability(modalities.includes('video')) },
      } satisfies ModelInfo;
    }).filter((model: ModelInfo) => model.id);
  },
  async validateCredentials(apiKey) { await this.listModels(apiKey); },
  async testConnection(input) {
    await this.generateText({ ...input, system: 'Responda apenas OK.', prompt: 'Teste de conexão. Responda OK.' });
    return { ok: true, model: input.model };
  },
  async generateText(input) {
    const { body } = await fetchJson(`${endpoint}/chat/completions`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ model: input.model, temperature: 0.7, max_tokens: 1200, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.prompt }] }),
    }, 'OpenRouter');
    const message = asObject(asObject(asArray(body.choices)[0]).message);
    return { text: ensureResponseText(message.content, 'OpenRouter'), usage: asObject(body.usage) };
  },
  async analyzeImage(input) {
    const { mimeType, base64 } = parseDataUrl(input.dataUrl);
    const { body } = await fetchJson(`${endpoint}/chat/completions`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ model: input.model, max_tokens: 1200, messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: [{ type: 'text', text: input.question }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }] },
      ] }),
    }, 'OpenRouter');
    const message = asObject(asObject(asArray(body.choices)[0]).message);
    return { text: ensureResponseText(message.content, 'OpenRouter'), usage: asObject(body.usage) };
  },
};
