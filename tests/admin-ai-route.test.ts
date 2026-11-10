import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/ai-credentials/store', () => {
  class CredentialStoreError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'CredentialStoreError';
    }
  }
  return {
    CredentialStoreError,
    auditProviderTest: vi.fn(),
    consumeAdminRateLimit: vi.fn(),
    getSavedProviderCredential: vi.fn(),
    isVaultDatabaseConfigured: vi.fn(),
    listProviderConfigs: vi.fn(),
    listProviderModels: vi.fn(),
    markProviderTestPassed: vi.fn(),
    persistTestedProviderConfig: vi.fn(),
    recordProviderTestFailure: vi.fn(),
    setProviderConfigState: vi.fn(),
    testProviderConnection: vi.fn(),
  };
});

import { GET, POST } from '@/app/api/admin/settings/ai/route';
import { AIProviderError } from '@/lib/ai-providers';
import { requireAdmin } from '@/lib/require-admin';
import * as store from '@/lib/ai-credentials/store';

type Json = Record<string, unknown>;
const asJson = (response: Response) => response.json() as Promise<Json>;
const configId = '11111111-1111-4111-8111-111111111111';

function setAuth(user: { id: string } | null, authorized: boolean) {
  vi.mocked(requireAdmin).mockResolvedValue({ supabase: {}, user, authorized } as unknown as Awaited<ReturnType<typeof requireAdmin>>);
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/admin/settings/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

const savedConfig = {
  id: configId, provider: 'gemini', displayName: 'Google Gemini', model: 'gemini-2.5-flash',
  task: 'script_generation', enabled: true, isDefault: true, connectionStatus: 'connected',
  lastTestedAt: '2026-11-10T00:00:00.000Z', lastError: null,
  capabilities: { text: true, image: 'unknown', video: 'unknown' },
};

beforeEach(() => {
  vi.clearAllMocks();
  setAuth({ id: 'actor-1' }, true);
  vi.mocked(store.isVaultDatabaseConfigured).mockReturnValue(true);
  vi.mocked(store.consumeAdminRateLimit).mockResolvedValue(true);
  vi.mocked(store.auditProviderTest).mockResolvedValue(undefined);
  vi.mocked(store.recordProviderTestFailure).mockResolvedValue(undefined);
});

describe('GET /api/admin/settings/ai', () => {
  it('exige sessão administrativa', async () => {
    setAuth(null, false);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('recusa usuário sem papel admin', async () => {
    setAuth({ id: 'actor-1' }, false);
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('informa vault indisponível sem consultar configurações', async () => {
    vi.mocked(store.isVaultDatabaseConfigured).mockReturnValue(false);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await asJson(response);
    expect(body.vaultReady).toBe(false);
    expect(body.configs).toEqual([]);
    expect(vi.mocked(store.listProviderConfigs)).not.toHaveBeenCalled();
  });

  it('lista configurações salvas quando o Vault está pronto', async () => {
    vi.mocked(store.listProviderConfigs).mockResolvedValue([savedConfig as never]);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await asJson(response);
    expect(body.vaultReady).toBe(true);
    expect(Array.isArray(body.providers)).toBe(true);
    expect((body.configs as Json[])[0].model).toBe('gemini-2.5-flash');
  });

  it('traduz a falha de credencial do servidor em mensagem acionável', async () => {
    vi.mocked(store.listProviderConfigs).mockRejectedValue(new Error('VAULT_DATABASE_NOT_CONFIGURED'));
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await asJson(response);
    expect(body.code).toBe('vault_not_configured');
    expect(String(body.message ?? body.error)).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('mapeia erro de permissão do banco para a migration correta', async () => {
    vi.mocked(store.listProviderConfigs).mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
    const response = await GET();
    const body = await asJson(response);
    expect(body.code).toBe('vault_permissions_error');
    expect(String(body.error)).toContain('ai_vault_rpc');
  });

  it('revela o código em falhas internas para suporte', async () => {
    vi.mocked(store.listProviderConfigs).mockRejectedValue(Object.assign(new Error('boom'), { code: 'XYZ12' }));
    const response = await GET();
    const body = await asJson(response);
    expect(body.code).toBe('internal_configuration_error');
    expect(String(body.error)).toContain('XYZ12');
  });
});

describe('POST /api/admin/settings/ai', () => {
  it('recusa corpo inválido', async () => {
    const response = await post({ action: 'nope' });
    expect(response.status).toBe(400);
  });

  it('aplica limite de operações administrativas', async () => {
    vi.mocked(store.consumeAdminRateLimit).mockResolvedValue(false);
    const response = await post({ action: 'delete', configId });
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('testa conexão com chave temporária e audita sucesso', async () => {
    vi.mocked(store.testProviderConnection).mockResolvedValue({ text: 'OK' } as never);
    const response = await post({ action: 'test', provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'sk-test', task: 'script_generation' });
    expect(response.status).toBe(200);
    expect(vi.mocked(store.auditProviderTest)).toHaveBeenCalledWith(expect.objectContaining({ success: true, provider: 'gemini' }));
    expect(vi.mocked(store.recordProviderTestFailure)).not.toHaveBeenCalled();
  });

  it('registra falha de credencial do provedor com o código sanitizado', async () => {
    vi.mocked(store.testProviderConnection).mockRejectedValue(new AIProviderError('invalid_credentials', 'Chave recusada pelo provedor.'));
    const response = await post({ action: 'test', provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'sk-bad', task: 'script_generation' });
    expect(response.status).toBe(400);
    expect(vi.mocked(store.recordProviderTestFailure)).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid_credentials' }));
  });

  it('salva e ativa somente após teste bem-sucedido', async () => {
    vi.mocked(store.testProviderConnection).mockResolvedValue({ text: 'OK' } as never);
    vi.mocked(store.persistTestedProviderConfig).mockResolvedValue(savedConfig as never);
    const response = await post({ action: 'save_activate', provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'sk-test', task: 'script_generation' });
    expect(response.status).toBe(200);
    expect(vi.mocked(store.persistTestedProviderConfig)).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini', model: 'gemini-2.5-flash', makeDefault: true }));
    const body = await asJson(response);
    expect(String(body.message)).toContain('validado');
  });

  it('exige chave nova ou credencial salva para ativar', async () => {
    const response = await post({ action: 'save_activate', provider: 'gemini', model: 'gemini-2.5-flash', task: 'script_generation' });
    expect(response.status).toBe(400);
  });

  it('impede usar credencial salva de outro provedor', async () => {
    vi.mocked(store.getSavedProviderCredential).mockResolvedValue({ provider: 'openai', model: 'gpt-4o-mini', task: 'script_generation', apiKey: 'sk' } as never);
    const response = await post({ action: 'save_activate', provider: 'gemini', model: 'gemini-2.5-flash', configId, task: 'script_generation' });
    expect(response.status).toBe(400);
    const body = await asJson(response);
    expect(String(body.error)).toContain('outro provedor');
    expect(vi.mocked(store.persistTestedProviderConfig)).not.toHaveBeenCalled();
  });

  it('lista modelos do provedor', async () => {
    vi.mocked(store.listProviderModels).mockResolvedValue([{ id: 'm1', displayName: 'Model 1', capabilities: { text: true, image: 'unknown', video: 'unknown' } }] as never);
    const response = await post({ action: 'list_models', provider: 'gemini', apiKey: 'sk-test', task: 'script_generation' });
    expect(response.status).toBe(200);
    const body = await asJson(response);
    expect((body.models as Json[]).length).toBe(1);
  });

  it('desativa e remove configurações com operação explícita', async () => {
    vi.mocked(store.setProviderConfigState).mockResolvedValue({ deleted: false, config: savedConfig } as never);
    const disable = await post({ action: 'disable', configId, provider: 'gemini', model: 'gemini-2.5-flash', task: 'script_generation' });
    expect(disable.status).toBe(200);
    expect(vi.mocked(store.setProviderConfigState)).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'disable' }));

    vi.mocked(store.setProviderConfigState).mockResolvedValue({ deleted: true, config: null } as never);
    const remove = await post({ action: 'delete', configId, provider: 'gemini', model: 'gemini-2.5-flash', task: 'script_generation' });
    expect(remove.status).toBe(200);
    expect(vi.mocked(store.setProviderConfigState)).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'delete' }));
  });

  it('exige configuração selecionada para desativar/remover', async () => {
    const response = await post({ action: 'delete', provider: 'gemini', model: 'gemini-2.5-flash', task: 'script_generation' });
    expect(response.status).toBe(400);
  });
});
