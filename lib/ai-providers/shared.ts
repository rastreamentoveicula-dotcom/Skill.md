import { AIProviderError, type CapabilityValue, type ModelInfo } from './types';

export type JsonObject = Record<string, unknown>;
export function asObject(value: unknown): JsonObject { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}; }
export function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function asString(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback; }

export async function fetchJson(url: string, init: RequestInit, providerName: string): Promise<{ response: Response; body: JsonObject }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = asObject(await response.json().catch(() => ({})));
    if (!response.ok) throw mapProviderError(response.status, providerName);
    return { response, body };
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new AIProviderError('timeout', `${providerName}: tempo limite excedido.`);
    throw new AIProviderError('unavailable', `${providerName}: falha temporária de conexão.`);
  } finally {
    clearTimeout(timer);
  }
}

export function mapProviderError(status: number, providerName: string): AIProviderError {
  if (status === 401 || status === 403) return new AIProviderError('invalid_credentials', `${providerName}: credencial inválida ou sem permissão.`, status);
  if (status === 402) return new AIProviderError('insufficient_balance', `${providerName}: saldo ou faturamento insuficiente.`, status);
  if (status === 404) return new AIProviderError('model_not_found', `${providerName}: modelo não encontrado.`, status);
  if (status === 429) return new AIProviderError('rate_limit', `${providerName}: limite de requisições atingido.`, status);
  if (status === 400 || status === 413 || status === 422) return new AIProviderError('invalid_request', `${providerName}: pedido ou modelo inválido.`, status);
  if (status >= 500) return new AIProviderError('unavailable', `${providerName}: serviço temporariamente indisponível.`, status);
  return new AIProviderError('provider_error', `${providerName}: erro do provedor.`, status);
}

export function ensureResponseText(value: unknown, providerName: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AIProviderError('provider_error', `${providerName}: resposta vazia.`);
  return value.trim();
}

export function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
  if (!match) throw new AIProviderError('invalid_request', 'Imagem inválida. Use PNG, JPEG, WebP ou GIF em Base64.');
  const mimeType = match[1];
  const base64 = match[2];
  if (Buffer.byteLength(base64, 'base64') > 5 * 1024 * 1024) throw new AIProviderError('invalid_request', 'A imagem excede o limite de 5 MB.');
  return { mimeType, base64 };
}

export function knownModel(model: string, displayName = model): ModelInfo {
  return { id: model, displayName, capabilities: { text: true, image: 'unknown', video: 'unknown' } };
}

export function modelCapability(value: unknown): CapabilityValue {
  return value === true ? 'supported' : value === false ? 'unsupported' : 'unknown';
}
