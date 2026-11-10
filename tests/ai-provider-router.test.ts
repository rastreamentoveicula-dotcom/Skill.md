import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai-credentials/store', () => ({ getActiveProviderConfig: vi.fn() }));
vi.mock('@/lib/ai-providers', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/ai-providers')>();
  return { ...original, getProviderAdapter: vi.fn() };
});

import { aiRouterErrorMessage, routeAIRequest } from '@/lib/ai-provider-router';
import { AIProviderError, getProviderAdapter } from '@/lib/ai-providers';
import { getActiveProviderConfig } from '@/lib/ai-credentials/store';

const generateText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProviderAdapter).mockReturnValue({
    displayName: 'Google Gemini',
    generateText,
    testConnection: vi.fn(),
    listModels: vi.fn(),
  } as never);
  vi.mocked(getActiveProviderConfig).mockResolvedValue({
    id: 'c1', provider: 'gemini', model: 'gemini-2.5-flash', task: 'script_generation', apiKey: 'sk-live',
  } as never);
  generateText.mockResolvedValue({ text: 'ok', usage: {} });
});

describe('routeAIRequest', () => {
  it('executa a tarefa no provedor ativo e devolve o contexto', async () => {
    const result = await routeAIRequest({ task: 'script_generation', system: 'sys', prompt: 'prompt' });
    expect(result.text).toBe('ok');
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.task).toBe('script_generation');
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-live', model: 'gemini-2.5-flash' }));
  });

  it('envolve falhas inesperadas do provedor em mensagem temporária', async () => {
    generateText.mockRejectedValue(new Error('socket hang up'));
    await expect(routeAIRequest({ task: 'script_generation', system: 's', prompt: 'p' }))
      .rejects.toThrow('Falha temporária ao executar a solicitação no provedor ativo.');
  });

  it('preserva erros tipados do provedor', async () => {
    generateText.mockRejectedValue(new AIProviderError('rate_limit', 'Limite do provedor.'));
    await expect(routeAIRequest({ task: 'script_generation', system: 's', prompt: 'p' }))
      .rejects.toBeInstanceOf(AIProviderError);
  });
});

describe('aiRouterErrorMessage', () => {
  it('mostra a mensagem original de erros tipados', () => {
    expect(aiRouterErrorMessage(new AIProviderError('invalid_credentials', 'Chave inválida.'))).toBe('Chave inválida.');
  });

  it('orienta quando o Vault não está configurado', () => {
    expect(aiRouterErrorMessage(new Error('VAULT_DATABASE_NOT_CONFIGURED'))).toContain('Supabase Vault');
  });

  it('orienta quando o segredo sumiu do Vault', () => {
    expect(aiRouterErrorMessage(Object.assign(new Error('x'), { code: 'VAULT_SECRET_NOT_FOUND' }))).toContain('Cadastre-a novamente');
  });

  it('repassa mensagens de configuração ausente', () => {
    expect(aiRouterErrorMessage(Object.assign(new Error('Nenhum provedor ativo.'), { code: 'provider_not_configured' }))).toBe('Nenhum provedor ativo.');
    expect(aiRouterErrorMessage(Object.assign(new Error('Sem credencial.'), { code: 'credential_missing' }))).toBe('Sem credencial.');
  });

  it('usa mensagem genérica para falhas desconhecidas', () => {
    expect(aiRouterErrorMessage(new Error('???'))).toContain('Tente novamente');
  });
});
