import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Minimal health check: reports service-database connectivity class only.
// Never returns data, keys, or raw provider messages.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ status: 'degraded', db: 'unconfigured' }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('ai_provider_configs').select('id').limit(1);
    if (error) {
      const code = String((error as { code?: string | null }).code ?? '');
      const message = String(error.message ?? '');
      const rejected = /api key|jwt|unauthorized|401/i.test(message) || code === '401' || code === 'PGRST116';
      return NextResponse.json({ status: 'degraded', db: 'error', reason: rejected ? 'credentials_rejected' : 'query_failed', code: code || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ status: 'ok', db: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'error', reason: 'client_error' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
