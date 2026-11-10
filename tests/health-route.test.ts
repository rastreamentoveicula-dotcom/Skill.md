import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdminClient: vi.fn() }));

import { GET } from '@/app/api/health/route';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

function setEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('AI_SECRETS_ENCRYPTION_KEY', '0123456789abcdef0123456789abcdef');
}

function setDb(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(result) });
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue({ select }) } as unknown as ReturnType<typeof createSupabaseAdminClient>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('GET /api/health', () => {
  it('sinaliza banco não configurado sem vazar detalhes', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'degraded', db: 'unconfigured' });
    expect(JSON.stringify(body)).not.toContain('supabase');
  });

  it('reporta ok com banco saudável', async () => {
    setEnv();
    setDb({ data: [], error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('classifica credencial rejeitada sem vazar a mensagem crua', async () => {
    setEnv();
    setDb({ data: null, error: { message: 'Invalid API key', code: '401' } });
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'degraded', db: 'error', reason: 'credentials_rejected' });
    expect(JSON.stringify(body)).not.toContain('Invalid API key');
  });

  it('classifica falha de query comum', async () => {
    setEnv();
    setDb({ data: null, error: { message: 'timeout', code: '57014' } });
    const body = (await GET()).json() as Promise<Record<string, unknown>>;
    expect(await body).toMatchObject({ status: 'degraded', db: 'error', reason: 'query_failed' });
  });
});
