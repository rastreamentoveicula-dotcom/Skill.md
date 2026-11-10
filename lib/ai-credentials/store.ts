import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { AIProviderError, type AIProvider, type AITask, type ModelInfo } from '@/lib/ai-providers';
import { getProviderAdapter } from '@/lib/ai-providers';
import { readVaultSecret } from './vault-store';

export type ProviderConfig = {
  id: string;
  provider: AIProvider;
  displayName: string;
  model: string;
  task: AITask;
  enabled: boolean;
  isDefault: boolean;
  connectionStatus: 'not_configured' | 'pending' | 'connected' | 'error' | 'disabled';
  lastTestedAt: string | null;
  lastError: string | null;
  capabilities: ModelInfo['capabilities'];
};

export class CredentialStoreError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'CredentialStoreError'; }
}

export function isVaultDatabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const clientKey = Symbol.for('recriar-motion-ai.ai-credentials-client');
type ClientGlobal = typeof globalThis & { [clientKey]?: ReturnType<typeof createSupabaseAdminClient> };

function db() {
  if (!isVaultDatabaseConfigured()) throw new Error('VAULT_DATABASE_NOT_CONFIGURED');
  const root = globalThis as ClientGlobal;
  if (!root[clientKey]) root[clientKey] = createSupabaseAdminClient();
  return root[clientKey];
}

function rethrowDb(error: { code?: string | null; message?: string | null }): never {
  if (error.message === 'CONFIG_NOT_FOUND') throw new CredentialStoreError('config_not_found', 'Configuração não encontrada.');
  const mapped = new Error(error.message || 'Falha interna ao acessar a configuração segura de IA.');
  if (error.code) (mapped as Error & { code?: string }).code = error.code;
  throw mapped;
}

export async function consumeAdminRateLimit(actorId: string, bucket: 'provider_network' | 'admin_mutation') {
  const threshold = bucket === 'provider_network' ? 12 : 30;
  const { data, error } = await db().rpc('ai_provider_consume_rate_limit', { p_actor: actorId, p_bucket: bucket, p_threshold: threshold });
  if (error) rethrowDb(error);
  return data === true;
}

function mapConfig(row: Record<string, unknown>): ProviderConfig {
  const capabilities = (row.capabilities && typeof row.capabilities === 'object' ? row.capabilities : {}) as Partial<ModelInfo['capabilities']>;
  return {
    id: String(row.id), provider: row.provider as AIProvider, displayName: String(row.display_name || row.provider),
    model: String(row.model), task: row.task as AITask, enabled: Boolean(row.enabled), isDefault: Boolean(row.is_default),
    connectionStatus: row.connection_status as ProviderConfig['connectionStatus'],
    lastTestedAt: row.last_tested_at ? new Date(String(row.last_tested_at)).toISOString() : null,
    lastError: row.last_error ? String(row.last_error) : null,
    capabilities: { text: capabilities.text !== false, image: capabilities.image ?? 'unknown', video: capabilities.video ?? 'unknown' },
  };
}

const safeSelect = `id, provider, display_name, model, task, enabled, is_default, connection_status, last_tested_at, last_error, capabilities`;

export async function listProviderConfigs() {
  const { data, error } = await db().from('ai_provider_configs').select(safeSelect).order('provider').order('task').order('model');
  if (error) rethrowDb(error);
  return ((data ?? []) as Record<string, unknown>[]).map(mapConfig);
}

export async function testProviderConnection(input: { provider: AIProvider; model: string; apiKey: string }) {
  try {
    return await getProviderAdapter(input.provider).testConnection({ apiKey: input.apiKey, model: input.model, system: 'Responda somente OK.', prompt: 'Teste de conexão. Responda OK.' });
  } catch (error) {
    throw error instanceof AIProviderError ? error : new CredentialStoreError('provider_error', 'Falha temporária ao testar o provedor.');
  }
}

export async function listProviderModels(provider: AIProvider, apiKey: string) {
  try {
    const models = await getProviderAdapter(provider).listModels(apiKey);
    return models.map(model => ({ id: model.id, displayName: model.displayName, capabilities: model.capabilities }));
  } catch (error) {
    throw error instanceof AIProviderError ? error : new CredentialStoreError('provider_error', 'Não foi possível consultar os modelos deste provedor.');
  }
}

export async function getSavedProviderCredential(id: string) {
  const { data: row, error } = await db().from('ai_provider_configs').select('id, provider, model, task, vault_secret_id').eq('id', id).maybeSingle();
  if (error) rethrowDb(error);
  if (!row) throw new CredentialStoreError('config_not_found', 'Configuração não encontrada.');
  if (!row.vault_secret_id) throw new CredentialStoreError('credential_missing', 'Cadastre uma credencial para este provedor.');
  return { provider: row.provider as AIProvider, model: String(row.model), task: row.task as AITask, apiKey: await readVaultSecret(String(row.vault_secret_id)) };
}

export async function markProviderTestPassed(id: string, actorId: string) {
  const { data, error } = await db().rpc('ai_provider_mark_test_passed', { p_id: id, p_actor: actorId });
  if (error) rethrowDb(error);
  return mapConfig(data as Record<string, unknown>);
}

export async function auditProviderTest(input: { actorId: string; provider: AIProvider; model: string; task: AITask; success: boolean; errorCode?: string }) {
  const { error } = await db().from('audit_logs').insert({
    actor_id: input.actorId,
    action: 'ai_provider.connection_tested',
    target_type: 'ai_provider_config',
    target_id: null,
    metadata: { provider: input.provider, task: input.task, model: input.model, success: input.success, ...(input.errorCode ? { error_code: input.errorCode } : {}) },
  });
  if (error) rethrowDb(error);
}

export async function persistTestedProviderConfig(input: { provider: AIProvider; model: string; task: AITask; apiKey: string; actorId: string; makeDefault: boolean; capabilities?: ModelInfo['capabilities'] }) {
  const adapter = getProviderAdapter(input.provider);
  const { data, error } = await db().rpc('ai_provider_persist', {
    p_provider: input.provider,
    p_model: input.model,
    p_task: input.task,
    p_secret: input.apiKey,
    p_actor: input.actorId,
    p_make_default: input.makeDefault,
    p_display_name: adapter.displayName,
    p_capabilities: input.capabilities ?? { text: true, image: 'unknown', video: 'unknown' },
  });
  if (error) rethrowDb(error);
  return mapConfig(data as Record<string, unknown>);
}

export async function recordProviderTestFailure(input: { provider: AIProvider; model: string; task: AITask; code: string; actorId: string; configId?: string }) {
  const safeCode = /^[a-z_]{2,40}$/.test(input.code) ? input.code : 'provider_error';
  const { error } = await db().rpc('ai_provider_record_failure', {
    p_id: input.configId ?? null,
    p_provider: input.provider,
    p_model: input.model,
    p_task: input.task,
    p_code: safeCode,
    p_actor: input.actorId,
  });
  if (error) rethrowDb(error);
}

export async function setProviderConfigState(input: { id: string; actorId: string; operation: 'disable' | 'delete' }) {
  const { data, error } = await db().rpc('ai_provider_set_state', { p_id: input.id, p_actor: input.actorId, p_operation: input.operation });
  if (error) rethrowDb(error);
  const result = (data ?? {}) as { deleted?: boolean; config?: Record<string, unknown> | null };
  return { deleted: result.deleted === true, config: result.config ? mapConfig(result.config) : null };
}

export async function getActiveProviderConfig(task: AITask) {
  const query = () => db().from('ai_provider_configs').select('id, provider, model, task, vault_secret_id').eq('enabled', true).eq('is_default', true).eq('connection_status', 'connected');
  let { data: row, error } = await query().eq('task', task).limit(1).maybeSingle();
  if (error) rethrowDb(error);
  if (!row && task !== 'conversation') {
    ({ data: row, error } = await query().eq('task', 'conversation').limit(1).maybeSingle());
    if (error) rethrowDb(error);
  }
  if (!row) throw new CredentialStoreError('provider_not_configured', `Nenhum provedor ativo para a função ${task}.`);
  if (!row.vault_secret_id) throw new CredentialStoreError('credential_missing', 'O provedor ativo não tem uma credencial no Vault.');
  return { id: String(row.id), provider: row.provider as AIProvider, model: String(row.model), task: row.task as AITask, apiKey: await readVaultSecret(String(row.vault_secret_id)) };
}
