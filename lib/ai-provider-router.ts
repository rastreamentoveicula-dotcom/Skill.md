import 'server-only';
import { getProviderAdapter } from '@/lib/ai-providers';
import { getActiveProviderConfig } from '@/lib/ai-credentials/store';
import type { AITask } from '@/lib/ai-providers';
import { AIProviderError } from '@/lib/ai-providers';

export type AIRouterInput = { task: AITask; system: string; prompt: string };

export async function routeAIRequest(input: AIRouterInput) {
  const config = await getActiveProviderConfig(input.task);
  try {
    const adapter = getProviderAdapter(config.provider);
    const result = await adapter.generateText({ apiKey: config.apiKey, model: config.model, system: input.system, prompt: input.prompt });
    return { ...result, provider: config.provider, model: config.model, task: config.task };
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new Error('Falha temporária ao executar a solicitação no provedor ativo.');
  }
}

export function aiRouterErrorMessage(error: unknown) {
  if (error instanceof AIProviderError) return error.message;
  if (error instanceof Error && error.message === 'VAULT_DATABASE_NOT_CONFIGURED') {
    return 'O acesso server-side ao Supabase Vault ainda não foi configurado.';
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === 'provider_not_configured' || code === 'credential_missing') return error instanceof Error ? error.message : 'A configuração do provedor está incompleta.';
    if (code === 'VAULT_SECRET_NOT_FOUND') return 'A credencial do provedor não foi localizada no Vault. Cadastre-a novamente como administrador.';
  }
  return 'Falha ao processar a solicitação de IA. Tente novamente ou contate um administrador.';
}
