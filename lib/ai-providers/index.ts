import 'server-only';
import { AIProviderError, type AIProvider, type AIProviderAdapter, type GenerateTextInput, type ModelInfo } from './types';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openaiAdapter } from './openai';
import { openrouterAdapter } from './openrouter';

export * from './types';

export const PROVIDER_ADAPTERS: Record<AIProvider, AIProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  openrouter: openrouterAdapter,
};

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: geminiAdapter.defaultModel,
  openai: openaiAdapter.defaultModel,
  anthropic: anthropicAdapter.defaultModel,
  openrouter: openrouterAdapter.defaultModel,
};

export function getProviderAdapter(provider: AIProvider) {
  return PROVIDER_ADAPTERS[provider];
}

export function getProviderCatalog() {
  return Object.values(PROVIDER_ADAPTERS).map(adapter => ({
    provider: adapter.id,
    displayName: adapter.displayName,
    defaultModel: adapter.defaultModel,
    capabilities: {
      methods: ['validateCredentials', 'listModels', 'testConnection', 'generateText', ...(adapter.analyzeImage ? ['analyzeImage'] : [])],
      videoAnalysis: false,
    },
  }));
}

export async function generateWithProvider(input: GenerateTextInput & { provider: AIProvider }) {
  return getProviderAdapter(input.provider).generateText(input);
}

export function safeConnectionMessage(error: unknown) {
  if (error instanceof AIProviderError) return { code: error.code, message: error.message };
  return { code: 'provider_error' as const, message: 'Falha interna ao comunicar com o provedor.' };
}

export type { ModelInfo };
