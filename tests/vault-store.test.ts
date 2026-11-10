import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdminClient: vi.fn() }));

import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  createVaultSecret,
  deleteVaultSecret,
  isVaultDatabaseConfigured,
  readVaultSecret,
  updateVaultSecret,
} from '@/lib/ai-credentials/vault-store';

type QueryResult = { data?: unknown; error?: unknown };
const rpcMock = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<QueryResult>>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.mocked(createSupabaseAdminClient).mockImplementation(() => ({
    rpc: rpcMock,
  }) as unknown as ReturnType<typeof createSupabaseAdminClient>);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuração do Vault', () => {
  it('só está pronta com URL e chave de serviço presentes', () => {
    expect(isVaultDatabaseConfigured()).toBe(true);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(isVaultDatabaseConfigured()).toBe(false);
  });

  it('falha cedo sem credenciais de servidor', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await expect(readVaultSecret('v1')).rejects.toThrow('VAULT_DATABASE_NOT_CONFIGURED');
  });
});

describe('readVaultSecret', () => {
  it('devolve o segredo decifrado', async () => {
    rpcMock.mockResolvedValue({ data: 'sk-live', error: null });
    await expect(readVaultSecret('v1')).resolves.toBe('sk-live');
    expect(rpcMock).toHaveBeenCalledWith('ai_vault_read', { p_id: 'v1' });
  });

  it('traduz segredo ausente', async () => {
    rpcMock.mockResolvedValue({ error: { code: 'P0001', message: 'VAULT_SECRET_NOT_FOUND' } });
    await expect(readVaultSecret('v1')).rejects.toThrow('VAULT_SECRET_NOT_FOUND');
  });

  it('não revela detalhes de falhas internas', async () => {
    rpcMock.mockResolvedValue({ error: { code: '500', message: 'disk on fire' } });
    await expect(readVaultSecret('v1')).rejects.toThrow('VAULT_READ_FAILED');
  });
});

describe('createVaultSecret', () => {
  it('devolve o id do novo segredo', async () => {
    rpcMock.mockResolvedValue({ data: 'v9', error: null });
    await expect(createVaultSecret('sk', 'nome', 'desc')).resolves.toBe('v9');
  });

  it('falha quando o RPC não devolve id', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(createVaultSecret('sk', 'nome', 'desc')).rejects.toThrow('VAULT_CREATE_FAILED');
  });
});

describe('updateVaultSecret e deleteVaultSecret', () => {
  it('propaga falha de atualização', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'nope' } });
    await expect(updateVaultSecret('v1', 'sk', 'n', 'd')).rejects.toThrow('VAULT_UPDATE_FAILED');
  });

  it('confirma exclusão apenas quando o RPC retorna true', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(deleteVaultSecret('v1')).resolves.toBe(true);
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(deleteVaultSecret('v1')).resolves.toBe(false);
    rpcMock.mockResolvedValue({ error: { message: 'nope' } });
    await expect(deleteVaultSecret('v1')).resolves.toBe(false);
  });
});
