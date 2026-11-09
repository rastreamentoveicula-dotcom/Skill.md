import 'server-only';
import { type AIProviderAdapter, type ModelInfo } from './types';
import { asArray, asObject, asString, ensureResponseText, fetchJson, knownModel, parseDataUrl } from './shared';

const endpoint = 'https://api.anthropic.com/v1';
const authHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });
const textFromContent = (content: unknown) => asArray(content).map(part => {
  const value = asObject(part);
  return value.type === 'text' ? asString(value.text) : '';
}).join('');

export const anthropicAdapter: AIProviderAdapter = {
  id: 'anthropic',
  displayName: 'Anthropic Claude',
  defaultModel: 'claude-3-5-haiku-latest',
  async listModels(apiKey) {
    const { body } = await fetchJson(`${endpoint}/models?limit=1000`, { headers: authHeaders(apiKey) }, 'Anthropic');
    return asArray(body.data).map(entry => {
      const model = asObject(entry);
      const id = asString(model.id);
      return knownModel(id, asString(model.display_name, id));
    }).filter((model: ModelInfo) => model.id);
  },
  async validateCredentials(apiKey) { await this.listModels(apiKey); },
  async testConnection(input) {
    await this.generateText({ ...input, system: 'Responda apenas OK.', prompt: 'Teste de conexão. Responda OK.' });
    return { ok: true, model: input.model };
  },
  async generateText(input) {
    const { body } = await fetchJson(`${endpoint}/messages`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ model: input.model, system: input.system, max_tokens: 1200, messages: [{ role: 'user', content: input.prompt }] }),
    }, 'Anthropic');
    return { text: ensureResponseText(textFromContent(body.content), 'Anthropic'), usage: asObject(body.usage) };
  },
  async analyzeImage(input) {
    const { mimeType, base64 } = parseDataUrl(input.dataUrl);
    const { body } = await fetchJson(`${endpoint}/messages`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ model: input.model, system: input.system, max_tokens: 1200, messages: [{ role: 'user', content: [
        { type: 'text', text: input.question }, { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      ] }] }),
    }, 'Anthropic');
    return { text: ensureResponseText(textFromContent(body.content), 'Anthropic'), usage: asObject(body.usage) };
  },
};
