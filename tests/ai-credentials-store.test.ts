import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdminClient: vi.fn() }));

import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  consumeAdminRateLimit,
  getActiveProviderConfig,
  getSavedProviderCredential,
  listProviderConfigs,
  markProviderTestPassed,
  persistTestedProviderConfig,
  recordProviderTestFailure,
  setProviderConfigState,
  CredentialStoreError,
} from '@/lib/ai-credentials/store';

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

const rpcMock = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<QueryResult>>();
const fromMock = vi.fn<(table: string) => unknown>();

function selectOrderChain(payload: QueryResult) {
  return { select: () => ({ order: () => ({ order: () => ({ order: () => Promise.resolve(payload) }) }) }) };
}
function selectEqMaybeSingle(payload: QueryResult) {
  return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(payload) }) }) };
}
function selectActiveChain(payload: QueryResult) {
  return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve(payload) }) }) }) }) }) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.mocked(createSupabaseAdminClient).mockImplementation(() => ({
    rpc: rpcMock,
    from: fromMock,
  }) as unknown as ReturnType<typeof createSupabaseAdminClient>);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('limite de operações administrativas', () => {
  it('usa limiares distintos por tipo de operação', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(consumeAdminRateLimit('actor-1', 'provider_network')).resolves.toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('ai_provider_consume_rate_limit', { p_actor: 'actor-1', p_bucket: 'provider_network', p_threshold: 12 });
    await expect(consumeAdminRateLimit('actor-1', 'admin_mutation')).resolves.toBe(true);
    expect(rpcMock).toHaveBeenLastCalledWith('ai_provider_consume_rate_limit', { p_actor: 'actor-1', p_bucket: 'admin_mutation', p_threshold: 30 });
  });

  it('retorna falso quando o orçamento estourou', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(consumeAdminRateLimit('actor-1', 'provider_network')).resolves.toBe(false);
  });

  it('propaga o código do erro do banco', async () => {
    rpcMock.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    await expect(consumeAdminRateLimit('actor-1', 'provider_network')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('listProviderConfigs', () => {
  it('normaliza linhas do banco com valores padrão', async () => {
    fromMock.mockReturnValue(selectOrderChain({
      data: [{ id: 'c1', provider: 'gemini', display_name: '', model: 'm1', task: 'conversation', enabled: true, is_default: false, connection_status: 'pending', last_tested_at: null, last_error: 'x', capabilities: null }],
      error: null,
    }));
    const [config] = await listProviderConfigs();
    expect(config.displayName).toBe('gemini');
    expect(config.capabilities).toEqual({ text: true, image: 'unknown', video: 'unknown' });
    expect(config.lastTestedAt).toBeNull();
    expect(config.connectionStatus).toBe('pending');
  });

  it('converte erro CONFIG_NOT_FOUND em CredentialStoreError', async () => {
    fromMock.mockReturnValue(selectOrderChain({ error: { code: 'P0001', message: 'CONFIG_NOT_FOUND' } }));
    await expect(listProviderConfigs()).rejects.toBeInstanceOf(CredentialStoreError);
  });
});

describe('getSavedProviderCredential', () => {
  it('falha com config_not_found quando não há registro', async () => {
    fromMock.mockReturnValue(selectEqMaybeSingle({ data: null, error: null }));
    await expect(getSavedProviderCredential('c1')).rejects.toMatchObject({ code: 'config_not_found' });
  });

  it('falha com credential_missing sem segredo no Vault', async () => {
    fromMock.mockReturnValue(selectEqMaybeSingle({ data: { id: 'c1', provider: 'gemini', model: 'm1', task: 'conversation', vault_secret_id: null }, error: null }));
    await expect(getSavedProviderCredential('c1')).rejects.toMatchObject({ code: 'credential_missing' });
  });
});

describe('markProviderTestPassed', () => {
  it('transforma erro CONFIG_NOT_FOUND do RPC em config_not_found', async () => {
    rpcMock.mockResolvedValue({ error: { code: 'P0001', message: 'CONFIG_NOT_FOUND' } });
    await expect(markProviderTestPassed('c1', 'actor-1')).rejects.toMatchObject({ code: 'config_not_found' });
    expect(rpcMock).toHaveBeenCalledWith('ai_provider_mark_test_passed', { p_id: 'c1', p_actor: 'actor-1' });
  });
});

describe('persistTestedProviderConfig', () => {
  it('envia nome de exibição do adaptador e ativa por padrão', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'c1', provider: 'openai', display_name: 'OpenAI', model: 'gpt-4o-mini', task: 'script_generation', enabled: true, is_default: true, connection_status: 'connected', last_tested_at: null, last_error: null, capabilities: { text: true, image: 'unknown', video: 'unknown' } }, error: null });
    const config = await persistTestedProviderConfig({ provider: 'openai', model: 'gpt-4o-mini', task: 'script_generation', apiKey: 'sk', actorId: 'actor-1', makeDefault: true });
    expect(config.displayName).toBe('OpenAI');
    expect(rpcMock).toHaveBeenCalledWith('ai_provider_persist', expect.objectContaining({ p_provider: 'openai', p_secret: 'sk', p_make_default: true, p_display_name: expect.any(String) }));
  });
});

describe('recordProviderTestFailure', () => {
  it('sanitiza códigos de erro fora do padrão', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await recordProviderTestFailure({ provider: 'gemini', model: 'm1', task: 'conversation', code: 'BAD CODE!!', actorId: 'actor-1' });
    expect(rpcMock).toHaveBeenCalledWith('ai_provider_record_failure', expect.objectContaining({ p_code: 'provider_error', p_id: null }));
  });
});

describe('setProviderConfigState', () => {
  it('repassa o resultado do RPC com configuração mapeada', async () => {
    fromMock.mockReturnValue(selectActiveChain({ data: { id: 'c1', provider: 'gemini', model: 'm1', task: 'conversation', vault_secret_id: 'v1' }, error: null }));
    rpcMock.mockResolvedValue({ data: { deleted: true, config: null }, error: null });
    const result = await setProviderConfigState({ id: 'c1', actorId: 'actor-1', operation: 'delete' });
    expect(result).toEqual({ deleted: true, config: null });
    expect(rpcMock).toHaveBeenCalledWith('ai_provider_set_state', { p_id: 'c1', p_actor: 'actor-1', p_operation: 'delete' });
  });
});

describe('getActiveProviderConfig', () => {
  it('cai para a função conversação quando a tarefa específica não existe', async () => {
    fromMock
      .mockReturnValueOnce(selectActiveChain({ data: null, error: null }))
      .mockReturnValueOnce(selectActiveChain({ data: { id: 'c1', provider: 'gemini', model: 'm1', task: 'conversation', vault_secret_id: 'v1' }, error: null }));
    rpcMock.mockResolvedValue({ data: 'sk-live', error: null });
    const config = await getActiveProviderConfig('script_generation');
    expect(config.task).toBe('conversation');
    expect(config.apiKey).toBe('sk-live');
  });

  it('informa ausência de provedor ativo para a função', async () => {
    fromMock.mockReturnValue(selectActiveChain({ data: null, error: null }));
    await expect(getActiveProviderConfig('conversation')).rejects.toMatchObject({ code: 'provider_not_configured' });
    await expect(getActiveProviderConfig('conversation')).rejects.toThrow(/conversation/);
  });

  it('exige credencial no Vault para o provedor ativo', async () => {
    fromMock.mockReturnValue(selectActiveChain({ data: { id: 'c1', provider: 'gemini', model: 'm1', task: 'conversation', vault_secret_id: null }, error: null }));
    await expect(getActiveProviderConfig('conversation')).rejects.toMatchObject({ code: 'credential_missing' });
  });
});
