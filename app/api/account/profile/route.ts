import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const updateSchema = z.object({ displayName: z.string().trim().min(1).max(80).optional(), avatarPath: z.string().max(220).nullable().optional() }).strict();

async function currentProfile() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  const { data: profile, error: profileError } = await supabase.from('profiles').select('display_name,avatar_url,email').eq('id', user.id).maybeSingle();
  if (profileError) return { response: NextResponse.json({ error: 'Could not load profile' }, { status: 503 }) };
  if (user.email && profile?.email !== user.email) await supabase.from('profiles').update({ email: user.email }).eq('id', user.id);
  let avatarUrl: string | null = null;
  if (profile?.avatar_url?.startsWith(`${user.id}/profile/`)) {
    const { data } = await supabase.storage.from('motion-media').createSignedUrl(profile.avatar_url, 3600);
    avatarUrl = data?.signedUrl ?? null;
  }
  return { supabase, user, profile, avatarUrl };
}

export async function GET() {
  const result = await currentProfile();
  if ('response' in result) return result.response;
  return NextResponse.json({ email: result.user.email ?? '', displayName: result.profile?.display_name ?? '', avatarUrl: result.avatarUrl, avatarPath: result.profile?.avatar_url ?? null, hasAvatar: Boolean(result.profile?.avatar_url) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request) {
  const result = await currentProfile();
  if ('response' in result) return result.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  const patch: { display_name?: string; avatar_url?: string | null } = {};
  if (parsed.data.displayName !== undefined) patch.display_name = parsed.data.displayName;
  if (parsed.data.avatarPath !== undefined) {
    const path = parsed.data.avatarPath;
    if (path && !new RegExp(`^${result.user.id}/profile/avatar-[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`, 'i').test(path)) return NextResponse.json({ error: 'Caminho de imagem inválido.' }, { status: 400 });
    patch.avatar_url = path;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nenhuma alteração enviada.' }, { status: 400 });
  const { error } = await result.supabase.from('profiles').update(patch).eq('id', result.user.id);
  if (error) return NextResponse.json({ error: 'Não foi possível salvar o perfil.' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
