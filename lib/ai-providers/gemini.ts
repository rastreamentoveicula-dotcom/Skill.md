import 'server-only';
import { type AIProviderAdapter, type ModelInfo } from './types';
import { asArray, asObject, asString, ensureResponseText, fetchJson, knownModel, parseDataUrl } from './shared';

const endpoint = 'https://generativelanguage.googleapis.com/v1beta';
const authHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': apiKey });
const textFromParts = (parts: unknown) => asArray(parts).map(part => asString(asObject(part).text)).join('');

export const geminiAdapter: AIProviderAdapter = {
  id: 'gemini',
  displayName: 'Google Gemini',
  defaultModel: 'gemini-3.8-flash',
  async listModels(apiKey) {
    const { body } = await fetchJson(`${endpoint}/models`, { headers: authHeaders(apiKey) }, 'Gemini');
    return asArray(body.models).map((entry) => {
      const model = asObject(entry);
      const methods = asArray(model.supportedGenerationMethods);
      return methods.includes('generateContent') ? knownModel(asString(model.name).replace(/^models\//, ''), asString(model.displayName, asString(model.name))) : null;
    }).filter((model): model is ModelInfo => model !== null && Boolean(model.id));
  },
  async validateCredentials(apiKey) { await this.listModels(apiKey); },
  async testConnection(input) {
    await this.generateText({ ...input, system: 'Responda apenas OK.', prompt: 'Teste de conexão. Responda OK.' });
    return { ok: true, model: input.model };
  },
  async generateText(input) {
    const { body } = await fetchJson(`${endpoint}/models/${encodeURIComponent(input.model)}:generateContent`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: 'user', parts: [{ text: input.prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } }),
    }, 'Gemini');
    const candidates = asArray(body.candidates);
    const candidate = asObject(candidates[0]);
    return { text: ensureResponseText(textFromParts(asObject(candidate.content).parts), 'Gemini'), usage: asObject(body.usageMetadata) };
  },
  async analyzeImage(input) {
    const { mimeType, base64 } = parseDataUrl(input.dataUrl);
    const { body } = await fetchJson(`${endpoint}/models/${encodeURIComponent(input.model)}:generateContent`, {
      method: 'POST', headers: authHeaders(input.apiKey),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: input.system }] }, contents: [{ role: 'user', parts: [{ text: input.question }, { inlineData: { mimeType, data: base64 } }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1200 } }),
    }, 'Gemini');
    const candidate = asObject(asArray(body.candidates)[0]);
    return { text: ensureResponseText(textFromParts(asObject(candidate.content).parts), 'Gemini'), usage: asObject(body.usageMetadata) };
  },
};
