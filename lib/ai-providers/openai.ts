import 'server-only';
import { type AIProviderAdapter, type ModelInfo } from './types';
import { asArray, asObject, asString, ensureResponseText, fetchJson, knownModel, parseDataUrl } from './shared';

const endpoint = 'https://api.openai.com/v1';
const authHeaders = (apiKey: string) => ({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' });

export const openaiAdapter: AIProviderAdapter = {
  id: 'openai',
  displayName: 'OpenAI',
  defaultModel: 'gpt-4o-mini',
  async listModels(apiKey) {
    const { body } = await fetchJson(`${endpoint}/models`, { headers: authHeaders(apiKey) }, 'OpenAI');
    return asArray(body.data).map(entry => {
      const model = asObject(entry);
      return knownModel(asString(model.id), asString(model.id));
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
    }, 'OpenAI');
    const choice = asObject(asArray(body.choices)[0]);
    const message = asObject(choice.message);
    return { text: ensureResponseText(message.content, 'OpenAI'), usage: asObject(body.usage) };
  },
  async analyzeImage(input) {
    const { mimeType, base64 } = parseDataUrl(input.dataUrl);
    const { body } = await fetchJson(`${endpoint}/chat/completions`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ model: input.model, max_tokens: 1200, messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: [{ type: 'text', text: input.question }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }] },
      ] }),
    }, 'OpenAI');
    const message = asObject(asObject(asArray(body.choices)[0]).message);
    return { text: ensureResponseText(message.content, 'OpenAI'), usage: asObject(body.usage) };
  },
};
