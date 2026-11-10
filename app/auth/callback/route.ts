import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) { const next=url.searchParams.get('next'); const target=next==='/auth/reset'?'/auth/reset':'/studio'; return NextResponse.redirect(new URL(target,url.origin)); }
  }
  return NextResponse.redirect(new URL('/login?error=auth_callback', url.origin));
}
