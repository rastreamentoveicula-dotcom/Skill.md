import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { decryptSecret, encryptSecret, hasValidEncryptionKey } from '@/lib/secret-vault';
import { DEFAULT_MODELS, generateWithProvider, type AIProvider } from '@/lib/ai-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const providers = ['gemini', 'openai', 'anthropic', 'openrouter'] as const;
const keyName = (provider: string) => `ai.key.${provider}`;
const configName = 'ai.provider.config';
const bodySchema = z.object({
  action: z.enum(['save', 'test', 'clear']),
  provider: z.enum(providers),
  model: z.string().trim().min(2).max(120).optional(),
  apiKey: z.string().trim().max(1000).optional(),
  activate: z.boolean().optional(),
}).strict();

async function authorize() {
  const result = await requireAdmin();
  if (!result.user) return { error: NextResponse.json({ error: 'Entre na conta administrativa.' }, { status: 401 }) };
  if (!result.authorized) return { error: NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403 }) };
  return { user: result.user };
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from('system_settings').select('key,value').in('key', [configName, ...providers.map(keyName)]);
    const settings = new Map((data ?? []).map(row => [row.key, row.value as Record<string, unknown>]));
    const config = (settings.get(configName) ?? {}) as { activeProvider?: string; models?: Record<string, string> };
    const keys = Object.fromEntries(providers.map(provider => [provider, Boolean(settings.get(keyName(provider))?.ciphertext)]));
    return NextResponse.json({ activeProvider: providers.includes(config.activeProvider as AIProvider) ? config.activeProvider : 'gemini', models: { ...DEFAULT_MODELS, ...(config.models ?? {}) }, keys, encryptionReady: hasValidEncryptionKey() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as configurações de IA. Verifique a chave de criptografia do servidor.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 });
  const { action, provider, apiKey } = parsed.data;
  try {
    const admin = createSupabaseAdminClient();
    const { data: configRow } = await admin.from('system_settings').select('value').eq('key', configName).maybeSingle();
    const config = (configRow?.value ?? {}) as { activeProvider?: string; models?: Record<string, string> };
    const model = parsed.data.model?.trim() || config.models?.[provider] || DEFAULT_MODELS[provider];
    const { data: keyRow } = await admin.from('system_settings').select('value').eq('key', keyName(provider)).maybeSingle();
    const storedCiphertext = (keyRow?.value as { ciphertext?: string } | null)?.ciphertext;

    if (action === 'clear') {
      await admin.from('system_settings').delete().eq('key', keyName(provider));
      return NextResponse.json({ ok: true, cleared: true });
    }

    if (action === 'test') {
      const secret = apiKey?.trim() || (storedCiphertext ? decryptSecret(storedCiphertext) : '');
      if (!secret) return NextResponse.json({ error: `Cadastre a chave de ${provider} antes de testar.` }, { status: 400 });
      const result = await generateWithProvider({ provider, model, apiKey: secret, system: 'Responda somente com OK.', prompt: 'Teste de conexão. Responda OK.' });
      return NextResponse.json({ ok: true, message: `Conexão validada com ${provider} (${model}).`, sample: result.text.slice(0, 80) });
    }

    if (apiKey?.trim()) {
      const ciphertext = encryptSecret(apiKey.trim());
      const { error } = await admin.from('system_settings').upsert({ key: keyName(provider), value: { ciphertext }, secret: true, updated_by: auth.user.id }, { onConflict: 'key' });
      if (error) throw error;
    }
    if (parsed.data.activate && !apiKey?.trim() && !storedCiphertext) return NextResponse.json({ error: `Cadastre uma chave para ${provider} antes de ativá-lo.` }, { status: 400 });
    const models = { ...(config.models ?? {}), [provider]: model };
    const activeProvider = parsed.data.activate ? provider : (config.activeProvider || 'gemini');
    const { error: configError } = await admin.from('system_settings').upsert({ key: configName, value: { activeProvider, models }, secret: false, updated_by: auth.user.id }, { onConflict: 'key' });
    if (configError) throw configError;
    return NextResponse.json({ ok: true, activeProvider, model, keySaved: Boolean(apiKey?.trim()) || Boolean(storedCiphertext) });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('AI_SECRETS_ENCRYPTION_KEY')
      ? 'Configure AI_SECRETS_ENCRYPTION_KEY no servidor antes de gravar chaves.'
      : error instanceof Error ? error.message : 'Falha ao salvar a configuração.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
