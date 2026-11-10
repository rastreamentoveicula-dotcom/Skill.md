import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));

import { GET, POST } from '@/app/api/projects/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type Json = Record<string, unknown>;
const asJson = (response: Response) => response.json() as Promise<Json>;

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
};

function setUser(id: string | null) {
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: id ? { id } : null }, error: null });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(supabaseMock as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
}

const validProject = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Tour do app',
  aspect: '16:9',
  scenes: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Giro lateral', description: 'O celular gira', duration: 4, color: '#6548bb' }],
  characters: [],
};

function post(body: unknown, raw?: string) {
  return POST(new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setUser('user-1');
});

describe('GET /api/projects', () => {
  it('exige autenticação', async () => {
    setUser(null);
    expect((await GET()).status).toBe(401);
  });

  it('ordena cenas por posição e aplica cores padrão', async () => {
    supabaseMock.from.mockReturnValue({
      select: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({
        data: [{
          id: 'p1', name: 'Projeto', aspect_ratio: '16:9', updated_at: '2026-11-10T00:00:00Z',
          scenes: [
            { id: 's2', position: 2, title: 'Segunda', description: '', duration_seconds: 3, visual_config: null },
            { id: 's1', position: 1, title: 'Primeira', description: '', duration_seconds: 5, visual_config: { color: '#123456' } },
          ],
          characters: [{ id: 'c1', name: 'N', role: 'r', description: '', personality: '', consistency_config: null }],
        }],
        error: null,
      }) }) }) }),
    });
    const response = await GET();
    expect(response.status).toBe(200);
    const [project] = await asJson(response) as unknown as Json[];
    const scenes = project.scenes as Json[];
    expect(scenes.map(s => s.id)).toEqual(['s1', 's2']);
    expect(scenes[0].color).toBe('#123456');
    expect(scenes[1].color).toBe('#6548bb');
  });
});

describe('POST /api/projects', () => {
  it('recusa projeto inválido', async () => {
    const response = await post({ ...validProject, aspect: '3:2' });
    expect(response.status).toBe(400);
    const body = await asJson(response);
    expect(body.error).toBe('Invalid project data');
  });

  it('recusa JSON malformado', async () => {
    const response = await post(null, 'not-json');
    expect(response.status).toBe(400);
  });

  it('salva via snapshot atômico', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: validProject.id, error: null });
    const response = await post(validProject);
    expect(response.status).toBe(201);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_project_snapshot', expect.objectContaining({ p_project_id: validProject.id }));
    const body = await asJson(response);
    expect(body.id).toBe(validProject.id);
  });
});
