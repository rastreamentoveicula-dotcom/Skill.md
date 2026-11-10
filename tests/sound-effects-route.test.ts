import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));

import { GET } from '@/app/api/sound-effects/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';

type Json = Record<string, unknown>;
const asJson = (response: Response) => response.json() as Promise<Json>;

const supabaseMock = { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() };

function setUser(id: string | null) {
  supabaseMock.auth.getUser.mockResolvedValue({ data: { user: id ? { id } : null }, error: null });
  vi.mocked(createSupabaseServerClient).mockResolvedValue(supabaseMock as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
}

function get(query = '') {
  return GET(new Request(`http://localhost/api/sound-effects${query}`));
}

function mockLibrary(rows: Json[], favorites: Json[] = [], categories: Json[] = []) {
  supabaseMock.rpc.mockResolvedValue({ data: rows, error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'user_sound_favorites') return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: favorites, error: null }) }) }) };
    return { select: () => ({ in: () => Promise.resolve({ data: categories, error: null }) }) };
  });
}

const activeRow = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Click', description: '', duration: 0.6,
  file_size: 100, file_format: 'mp3', category_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  waveform: [0.1, 0.9], tags: ['ui'], mood_tags: ['neutro'], is_featured: true,
  is_active: true, commercial_use_allowed: true, redistribution_allowed: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  setUser('user-1');
});

describe('GET /api/sound-effects', () => {
  it('exige autenticação', async () => {
    setUser(null);
    expect((await get()).status).toBe(401);
  });

  it('valida filtros numéricos e de categoria', async () => {
    expect((await get('?duration=0')).status).toBe(400);
    expect((await get('?duration=abc')).status).toBe(400);
    expect((await get('?duration=99999')).status).toBe(400);
    expect((await get('?category=abc')).status).toBe(400);
  });

  it('filtra itens inativos ou sem licença e marca favoritos/categorias', async () => {
    mockLibrary(
      [
        activeRow,
        { ...activeRow, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Oculto', is_active: false },
        { ...activeRow, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Restrito', commercial_use_allowed: false },
      ],
      [{ sound_effect_id: activeRow.id }],
      [{ id: activeRow.category_id, name: 'UI' }],
    );
    const response = await get('?q=click&favorites_only=1');
    expect(response.status).toBe(200);
    const body = await asJson(response);
    const items = body.items as Json[];
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Click');
    expect(items[0].favorite).toBe(true);
    expect(items[0].categoryName).toBe('UI');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('search_sound_effects', expect.objectContaining({ p_search: 'click', p_favorites_only: true }));
  });

  it('informa indisponibilidade da biblioteca sem a migration', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: { message: 'missing' } });
    const response = await get();
    expect(response.status).toBe(503);
  });
});
