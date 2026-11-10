import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/ai-provider-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/ai-provider-router')>();
  return { ...original, routeAIRequest: vi.fn() };
});

import { POST } from '@/app/api/agent/generate/route';
import { AIProviderError } from '@/lib/ai-providers';
import { routeAIRequest } from '@/lib/ai-provider-router';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type Json = Record<string, unknown>;
const asJson = (response: Response) => response.json() as Promise<Json>;

const validBody = {
  prompt: 'Crie um roteiro de abertura',
  project: {
    name: 'Tour do app',
    aspect: '16:9',
    scenes: [{ title: 'Giro lateral', description: 'O celular gira', duration: 4 }],
    characters: [],
  },
};

function post(body: unknown) {
  return POST(new Request('http://localhost/api/agent/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

function setUser(id: string | null) {
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: id ? { id } : null }, error: null }) },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
}

const usageInserts: Json[] = [];
function setAdmin(usageCount: number | null, countError: unknown = null) {
  usageInserts.length = 0;
  vi.mocked(createSupabaseAdminClient).mockImplementation(() => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ gte: () => Promise.resolve({ count: usageCount, error: countError }) }),
      }),
      insert: (row: Json) => {
        if (table === 'ai_usage_logs') usageInserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  }) as unknown as ReturnType<typeof createSupabaseAdminClient>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setUser('user-1');
  setAdmin(0);
  vi.mocked(routeAIRequest).mockResolvedValue({
    text: 'Roteiro pronto', provider: 'gemini', model: 'gemini-2.5-flash', task: 'script_generation',
    usage: { promptTokenCount: 10, candidatesTokenCount: 20 },
  } as never);
});

describe('POST /api/agent/generate', () => {
  it('exige autenticação', async () => {
    setUser(null);
    const response = await post(validBody);
    expect(response.status).toBe(401);
  });

  it('recusa pedidos inválidos', async () => {
    const response = await post({ prompt: 'a' });
    expect(response.status).toBe(400);
  });

  it('limita 20 chamadas de IA por hora por usuário', async () => {
    setAdmin(20);
    const response = await post(validBody);
    expect(response.status).toBe(429);
    const body = await asJson(response);
    expect(String(body.error)).toContain('20 chamadas');
  });

  it('responde com o texto do roteador e registra o consumo', async () => {
    const response = await post(validBody);
    expect(response.status).toBe(200);
    const body = await asJson(response);
    expect(body.text).toBe('Roteiro pronto');
    expect(body.provider).toBe('gemini');
    expect(usageInserts[0]).toMatchObject({ owner_id: 'user-1', status: 'success', task: 'creative_assistant' });
  });

  it('devolve 504 em timeout do provedor e registra erro', async () => {
    vi.mocked(routeAIRequest).mockRejectedValue(new AIProviderError('timeout', 'O provedor demorou demais.'));
    const response = await post(validBody);
    expect(response.status).toBe(504);
    expect(usageInserts[0]).toMatchObject({ status: 'error' });
  });

  it('mapeia falha de credencial do Vault para mensagem amigável', async () => {
    vi.mocked(routeAIRequest).mockRejectedValue(new Error('VAULT_DATABASE_NOT_CONFIGURED'));
    const response = await post(validBody);
    expect(response.status).toBe(503);
    const body = await asJson(response);
    expect(String(body.error)).toContain('Supabase Vault');
  });

  it('informa indisponibilidade quando o limite não pode ser verificado', async () => {
    setAdmin(null, new Error('db down'));
    const response = await post(validBody);
    expect(response.status).toBe(503);
  });
});
