import 'server-only';
import { AIProviderError, type AIProvider, type AITask, type ModelInfo } from '@/lib/ai-providers';
import { getProviderAdapter } from '@/lib/ai-providers';
import { createVaultSecret, deleteVaultSecret, readVaultSecret, updateVaultSecret, withVaultDatabase } from './vault-store';

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

export function isVaultDatabaseConfigured() { return Boolean(process.env.SUPABASE_DB_URL); }

export async function consumeAdminRateLimit(actorId: string, bucket: 'provider_network' | 'admin_mutation') {
  const threshold = bucket === 'provider_network' ? 12 : 30;
  return withVaultDatabase(async client => {
    const { rows } = await client.query<{ request_count: number }>(
      `insert into public.ai_provider_admin_rate_limits(actor_id,bucket,window_start,request_count)
       values($1::uuid,$2,now(),1)
       on conflict(actor_id,bucket) do update set
         request_count=case when public.ai_provider_admin_rate_limits.window_start < now()-interval '1 minute' then 1 else public.ai_provider_admin_rate_limits.request_count+1 end,
         window_start=case when public.ai_provider_admin_rate_limits.window_start < now()-interval '1 minute' then now() else public.ai_provider_admin_rate_limits.window_start end
       returning request_count`, [actorId, bucket],
    );
    return Number(rows[0]?.request_count ?? threshold + 1) <= threshold;
  });
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
  return withVaultDatabase(async client => {
    const { rows } = await client.query(`select ${safeSelect} from public.ai_provider_configs order by provider, task, model`);
    return rows.map(mapConfig);
  });
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
  return withVaultDatabase(async client => {
    const { rows } = await client.query(`select id, provider, model, task, vault_secret_id from public.ai_provider_configs where id=$1::uuid limit 1`, [id]);
    const row = rows[0];
    if (!row) throw new CredentialStoreError('config_not_found', 'Configuração não encontrada.');
    if (!row.vault_secret_id) throw new CredentialStoreError('credential_missing', 'Cadastre uma credencial para este provedor.');
    return { provider: row.provider as AIProvider, model: String(row.model), task: row.task as AITask, apiKey: await readVaultSecret(client, String(row.vault_secret_id)) };
  });
}

export async function markProviderTestPassed(id: string, actorId: string) {
  return withVaultDatabase(async client => {
    await client.query('begin');
    try {
      const { rows } = await client.query(
        `update public.ai_provider_configs set connection_status='connected',last_tested_at=now(),last_error=null,updated_at=now()
         where id=$1::uuid and vault_secret_id is not null returning ${safeSelect}`, [id],
      );
      if (!rows[0]) throw new CredentialStoreError('config_not_found', 'Configuração salva não encontrada.');
      await client.query(`insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values($1::uuid,'ai_provider.connection_tested','ai_provider_config',$2,$3::jsonb)`, [actorId, id, JSON.stringify({ provider: rows[0].provider, task: rows[0].task, model: rows[0].model, success: true })]);
      await client.query('commit');
      return mapConfig(rows[0]);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  });
}

export async function auditProviderTest(input: { actorId: string; provider: AIProvider; model: string; task: AITask; success: boolean; errorCode?: string }) {
  return withVaultDatabase(async client => {
    await client.query(`insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values($1::uuid,'ai_provider.connection_tested','ai_provider_config',null,$2::jsonb)`, [input.actorId, JSON.stringify({ provider: input.provider, task: input.task, model: input.model, success: input.success, ...(input.errorCode ? { error_code: input.errorCode } : {}) })]);
  });
}

export async function persistTestedProviderConfig(input: { provider: AIProvider; model: string; task: AITask; apiKey: string; actorId: string; makeDefault: boolean; capabilities?: ModelInfo['capabilities'] }) {
  const adapter = getProviderAdapter(input.provider);
  return withVaultDatabase(async client => {
    await client.query('begin');
    let createdSecretId: string | null = null;
    try {
      const existing = await client.query<{ vault_secret_id: string | null }>('select vault_secret_id from public.ai_provider_configs where provider=$1 and model=$2 and task=$3 for update', [input.provider, input.model, input.task]);
      const oldVaultId = existing.rows[0]?.vault_secret_id;
      const secretName = `ai-${input.provider}-${input.task}-${input.model}`.slice(0, 120);
      const description = `Credential for Recriar Motion AI provider ${input.provider}; task ${input.task}.`;
      const vaultSecretId = oldVaultId
        ? (await updateVaultSecret(client, String(oldVaultId), input.apiKey, secretName, description), String(oldVaultId))
        : (createdSecretId = await createVaultSecret(client, input.apiKey, secretName, description));
      if (input.makeDefault) await client.query('update public.ai_provider_configs set is_default=false where task=$1 and is_default=true', [input.task]);
      const { rows } = await client.query(
        `insert into public.ai_provider_configs
          (provider, display_name, model, task, enabled, is_default, secret_ref, vault_secret_id, connection_status, last_tested_at, last_error, capabilities, updated_by)
         values ($1,$2,$3,$4,true,$5,$6::text,$6::uuid,'connected',now(),null,$7::jsonb,$8::uuid)
         on conflict (provider,model,task) do update set display_name=excluded.display_name,enabled=true,is_default=excluded.is_default,
          secret_ref=excluded.secret_ref,vault_secret_id=excluded.vault_secret_id,connection_status='connected',last_tested_at=now(),last_error=null,
          capabilities=excluded.capabilities,updated_by=excluded.updated_by,updated_at=now() returning ${safeSelect}`,
        [input.provider, adapter.displayName, input.model, input.task, input.makeDefault, vaultSecretId, JSON.stringify(input.capabilities ?? { text: true, image: 'unknown', video: 'unknown' }), input.actorId],
      );
      await client.query(`insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values($1::uuid,'ai_provider.credential_saved','ai_provider_config',$2,$3::jsonb)`, [input.actorId, rows[0].id, JSON.stringify({ provider: input.provider, task: input.task, model: input.model, vault_backed: true })]);
      await client.query('commit');
      return mapConfig(rows[0]);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      if (createdSecretId) await deleteVaultSecret(client, createdSecretId).catch(() => false);
      throw error;
    }
  });
}

export async function recordProviderTestFailure(input: { provider: AIProvider; model: string; task: AITask; code: string; actorId: string; configId?: string }) {
  const safeCode = /^[a-z_]{2,40}$/.test(input.code) ? input.code : 'provider_error';
  return withVaultDatabase(async client => {
    await client.query('begin');
    try {
      let targetId: string | null = null;
      if (input.configId) {
        const { rows } = await client.query(
          `update public.ai_provider_configs set connection_status='error',last_tested_at=now(),last_error=$2,updated_at=now()
           where id=$1::uuid and provider=$3 and model=$4 and task=$5 returning id`,
          [input.configId, safeCode, input.provider, input.model, input.task],
        );
        targetId = rows[0]?.id ?? null;
      }
      await client.query(`insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values($1::uuid,'ai_provider.connection_tested','ai_provider_config',$2,$3::jsonb)`, [input.actorId, targetId, JSON.stringify({ provider: input.provider, task: input.task, model: input.model, success: false, error_code: safeCode })]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  });
}

export async function setProviderConfigState(input: { id: string; actorId: string; operation: 'disable' | 'delete' }) {
  return withVaultDatabase(async client => {
    await client.query('begin');
    try {
      const { rows: found } = await client.query<{ provider: string; task: string; vault_secret_id: string | null }>('select provider,task,vault_secret_id from public.ai_provider_configs where id=$1::uuid for update', [input.id]);
      const row = found[0];
      if (!row) throw new CredentialStoreError('config_not_found', 'Configuração não encontrada.');
      if (input.operation === 'disable') {
        const { rows } = await client.query(`update public.ai_provider_configs set enabled=false,is_default=false,connection_status='disabled',updated_by=$2::uuid,updated_at=now() where id=$1::uuid returning ${safeSelect}`, [input.id, input.actorId]);
        await client.query(`insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values($1::uuid,'ai_provider.disabled','ai_provider_config',$2,$3::jsonb)`, [input.actorId, input.id, JSON.stringify({ provider: row.provider, task: row.task })]);
        await client.query('commit');
        return { deleted: false, config: mapConfig(rows[0]) };
      }
      await client.query('delete from public.ai_provider_configs where id=$1::uuid', [input.id]);
      let vaultSecretDeleted = false;
      if (row.vault_secret_id) {
        const { rows: refs } = await client.query('select 1 from public.ai_provider_configs where vault_secret_id=$1::uuid limit 1', [row.vault_secret_id]);
        if (refs.length === 0) vaultSecretDeleted = await deleteVaultSecret(client, row.vault_secret_id);
      }
      await client.query(`insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values($1::uuid,'ai_provider.config_deleted','ai_provider_config',$2,$3::jsonb)`, [input.actorId, input.id, JSON.stringify({ provider: row.provider, task: row.task, vault_secret_deleted: vaultSecretDeleted })]);
      await client.query('commit');
      return { deleted: true, config: null };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  });
}

export async function getActiveProviderConfig(task: AITask) {
  return withVaultDatabase(async client => {
    const { rows } = await client.query(`select id,provider,model,task,vault_secret_id from public.ai_provider_configs where enabled=true and is_default=true and connection_status='connected' and task=$1 limit 1`, [task]);
    let row = rows[0];
    if (!row && task !== 'conversation') {
      const fallback = await client.query(`select id,provider,model,task,vault_secret_id from public.ai_provider_configs where enabled=true and is_default=true and connection_status='connected' and task='conversation' limit 1`);
      row = fallback.rows[0];
    }
    if (!row) throw new CredentialStoreError('provider_not_configured', `Nenhum provedor ativo para a função ${task}.`);
    if (!row.vault_secret_id) throw new CredentialStoreError('credential_missing', 'O provedor ativo não tem uma credencial no Vault.');
    return { id: String(row.id), provider: row.provider as AIProvider, model: String(row.model), task: row.task as AITask, apiKey: await readVaultSecret(client, String(row.vault_secret_id)) };
  });
}
