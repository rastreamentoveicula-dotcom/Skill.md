import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { decryptSecret, encryptSecret, hasValidEncryptionKey } from '@/lib/secret-vault';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const KEY = 'payments.mercadopago.access_token';
const bodySchema = z.object({ action: z.enum(['save','test','clear']), accessToken: z.string().trim().max(1000).optional() }).strict();
async function authorize() {
  const result = await requireAdmin();
  if (!result.user) return { error: NextResponse.json({ error: 'Entre na conta administrativa.' }, { status: 401 }) };
  if (!result.authorized) return { error: NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403 }) };
  return { user: result.user };
}
export async function GET() {
  const auth = await authorize(); if (auth.error) return auth.error;
  try {
    const admin = createSupabaseAdminClient();
    const [{ data: key }, { count: plans }, { count: subscriptions }, { count: transactions }, { count: webhooks }] = await Promise.all([
      admin.from('system_settings').select('value').eq('key', KEY).maybeSingle(),
      admin.from('subscription_plans').select('*', { count: 'exact', head: true }),
      admin.from('subscriptions').select('*', { count: 'exact', head: true }),
      admin.from('payment_transactions').select('*', { count: 'exact', head: true }),
      admin.from('payment_webhook_events').select('*', { count: 'exact', head: true }),
    ]);
    return NextResponse.json({ configured: Boolean((key?.value as { ciphertext?: string } | null)?.ciphertext), encryptionReady: hasValidEncryptionKey(), plans: plans ?? 0, subscriptions: subscriptions ?? 0, transactions: transactions ?? 0, webhooks: webhooks ?? 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Não foi possível carregar as configurações de pagamento.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  const auth = await authorize(); if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  try {
    const admin = createSupabaseAdminClient();
    const { data: row } = await admin.from('system_settings').select('value').eq('key', KEY).maybeSingle();
    const stored = (row?.value as { ciphertext?: string } | null)?.ciphertext;
    if (parsed.data.action === 'clear') {
      const { error } = await admin.from('system_settings').delete().eq('key', KEY);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const token = parsed.data.accessToken || (stored ? decryptSecret(stored) : '');
    if (!token) return NextResponse.json({ error: 'Cole o access token de produção ou sandbox do Mercado Pago.' }, { status: 400 });
    if (parsed.data.action === 'test') {
      const response = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'O Mercado Pago recusou o token. Confira ambiente e credenciais.' }, { status: 400 });
      if (!response.ok) return NextResponse.json({ error: `Mercado Pago respondeu HTTP ${response.status}.` }, { status: 502 });
      const data = await response.json();
      return NextResponse.json({ ok: true, message: `Token válido para a conta ${String(data.nickname || data.id || 'Mercado Pago')}.` });
    }
    if (!parsed.data.accessToken) return NextResponse.json({ error: 'Informe um token novo para salvar.' }, { status: 400 });
    const value = { ciphertext: encryptSecret(parsed.data.accessToken) };
    const { error } = await admin.from('system_settings').upsert({ key: KEY, value, secret: true, updated_by: auth.user.id }, { onConflict: 'key' });
    if (error) throw error;
    return NextResponse.json({ ok: true, configured: true });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('AI_SECRETS_ENCRYPTION_KEY') ? 'Configure AI_SECRETS_ENCRYPTION_KEY no servidor antes de gravar credenciais.' : 'Falha ao processar a configuração segura de pagamento.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
