import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

const clientKey = Symbol.for('recriar-motion-ai.vault-rpc-client');
type ClientGlobal = typeof globalThis & { [clientKey]?: ReturnType<typeof createSupabaseAdminClient> };

export function isVaultDatabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function vaultClient() {
  if (!isVaultDatabaseConfigured()) throw new Error('VAULT_DATABASE_NOT_CONFIGURED');
  const root = globalThis as ClientGlobal;
  if (!root[clientKey]) root[clientKey] = createSupabaseAdminClient();
  return root[clientKey];
}

export async function createVaultSecret(secret: string, name: string, description: string) {
  const { data, error } = await vaultClient().rpc('ai_vault_create', { p_secret: secret, p_name: name, p_description: description });
  if (error || typeof data !== 'string') throw new Error('VAULT_CREATE_FAILED');
  return data;
}

export async function readVaultSecret(id: string) {
  const { data, error } = await vaultClient().rpc('ai_vault_read', { p_id: id });
  if (error) {
    if (/VAULT_SECRET_NOT_FOUND/.test(error.message ?? '')) throw new Error('VAULT_SECRET_NOT_FOUND');
    throw new Error('VAULT_READ_FAILED');
  }
  return String(data);
}

export async function updateVaultSecret(id: string, secret: string, name: string, description: string) {
  const { error } = await vaultClient().rpc('ai_vault_update', { p_id: id, p_secret: secret, p_name: name, p_description: description });
  if (error) throw new Error('VAULT_UPDATE_FAILED');
}

export async function deleteVaultSecret(id: string) {
  const { data, error } = await vaultClient().rpc('ai_vault_delete', { p_id: id });
  if (error) return false;
  return data === true;
}
