export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';
export type AITask = 'conversation' | 'planning' | 'script_generation' | 'image_analysis' | 'video_analysis';
export type CapabilityValue = 'supported' | 'unsupported' | 'unknown';

export type ModelInfo = {
  id: string;
  displayName: string;
  capabilities: { text: boolean; image: CapabilityValue; video: CapabilityValue };
};

export type GenerateTextInput = {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
};

export type AnalyzeImageInput = GenerateTextInput & { dataUrl: string; question: string };
export type ProviderTestResult = { ok: true; model: string };

export interface AIProviderAdapter {
  readonly id: AIProvider;
  readonly displayName: string;
  readonly defaultModel: string;
  listModels(apiKey: string): Promise<ModelInfo[]>;
  validateCredentials(apiKey: string): Promise<void>;
  testConnection(input: GenerateTextInput): Promise<ProviderTestResult>;
  generateText(input: GenerateTextInput): Promise<{ text: string; usage: Record<string, unknown> | null }>;
  analyzeImage?(input: AnalyzeImageInput): Promise<{ text: string; usage: Record<string, unknown> | null }>;
}

export type ProviderErrorCode =
  | 'invalid_credentials'
  | 'model_not_found'
  | 'rate_limit'
  | 'insufficient_balance'
  | 'timeout'
  | 'unavailable'
  | 'invalid_request'
  | 'provider_error';

export class AIProviderError extends Error {
  constructor(readonly code: ProviderErrorCode, message: string, readonly status?: number) {
    super(message);
    this.name = 'AIProviderError';
  }
}
