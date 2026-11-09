import 'server-only';
import { Pool, type PoolClient } from 'pg';

const poolKey = Symbol.for('recriar-motion-ai.vault-pool');
type PoolGlobal = typeof globalThis & { [poolKey]?: Pool };

function pool() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('VAULT_DATABASE_NOT_CONFIGURED');
  const root = globalThis as PoolGlobal;
  if (!root[poolKey]) {
    root[poolKey] = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 15_000,
      application_name: 'recriar-motion-ai-vault',
    });
  }
  return root[poolKey] as Pool;
}

export async function withVaultDatabase<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

export async function createVaultSecret(client: PoolClient, secret: string, name: string, description: string) {
  const { rows } = await client.query<{ id: string }>(
    'select vault.create_secret($1::text, $2::text, $3::text, null::uuid) as id',
    [secret, name, description],
  );
  if (!rows[0]?.id) throw new Error('VAULT_CREATE_FAILED');
  return rows[0].id;
}

export async function updateVaultSecret(client: PoolClient, id: string, secret: string, name: string, description: string) {
  const { rowCount } = await client.query(
    'select vault.update_secret($1::uuid, $2::text, $3::text, $4::text, null::uuid)',
    [id, secret, name, description],
  );
  if (rowCount === 0) throw new Error('VAULT_UPDATE_FAILED');
}

export async function readVaultSecret(client: PoolClient, id: string) {
  const { rows } = await client.query<{ decrypted_secret: string }>(
    'select decrypted_secret from vault.decrypted_secrets where id = $1::uuid',
    [id],
  );
  if (!rows[0]?.decrypted_secret) throw new Error('VAULT_SECRET_NOT_FOUND');
  return rows[0].decrypted_secret;
}

export async function deleteVaultSecret(client: PoolClient, id: string) {
  const { rowCount } = await client.query('delete from vault.secrets where id = $1::uuid', [id]);
  return (rowCount ?? 0) > 0;
}
