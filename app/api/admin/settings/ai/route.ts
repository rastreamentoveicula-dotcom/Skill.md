import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/require-admin';
import { AIProviderError, getProviderCatalog } from '@/lib/ai-providers';
import {
  CredentialStoreError,
  auditProviderTest,
  consumeAdminRateLimit,
  getSavedProviderCredential,
  isVaultDatabaseConfigured,
  listProviderConfigs,
  listProviderModels,
  markProviderTestPassed,
  persistTestedProviderConfig,
  recordProviderTestFailure,
  setProviderConfigState,
  testProviderConnection,
} from '@/lib/ai-credentials/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const providers = ['gemini', 'openai', 'anthropic', 'openrouter'] as const;
const tasks = ['conversation', 'planning', 'script_generation', 'image_analysis', 'video_analysis'] as const;
const schema = z.object({
  action: z.enum(['test', 'list_models', 'save_activate', 'disable', 'delete']),
  provider: z.enum(providers).optional(),
  model: z.string().trim().min(2).max(120).optional(),
  task: z.enum(tasks).default('script_generation'),
  apiKey: z.string().trim().min(1).max(1000).optional(),
  configId: z.string().uuid().optional(),
  capabilities: z.object({ text: z.boolean(), image: z.enum(['supported', 'unsupported', 'unknown']), video: z.enum(['supported', 'unsupported', 'unknown']) }).optional(),
}).strict();

async function authorize() {
  const result = await requireAdmin();
  if (!result.user) return { error: NextResponse.json({ error: 'Entre na conta administrativa.' }, { status: 401 }) };
  if (!result.authorized) return { error: NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403 }) };
  return { user: result.user };
}

function safeError(error: unknown) {
  if (error instanceof AIProviderError) return { code: error.code, message: error.message };
  if (error instanceof CredentialStoreError) return { code: error.code, message: error.message };
  if (error instanceof Error && error.message === 'VAULT_DATABASE_NOT_CONFIGURED') {
    return { code: 'vault_not_configured', message: 'Configure SUPABASE_SERVICE_ROLE_KEY como segredo de servidor para o acesso ao Supabase Vault.' };
  }
  if (error instanceof Error && error.message === 'VAULT_SECRET_NOT_FOUND') {
    return { code: 'vault_secret_not_found', message: 'Credencial não encontrada no Supabase Vault. Cadastre-a novamente.' };
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (code === '42P01' || code === '42703') return { code: 'vault_schema_not_ready', message: 'A migration do módulo de IA ainda não foi aplicada no Supabase. Revise e aplique a migration antes de configurar provedores.' };
    if (code === '42501') return { code: 'vault_permissions_error', message: 'Permissões insuficientes no Supabase. Confirme que a migration do módulo de IA (ai_vault_rpc) foi aplicada.' };
    if (code === '401' || code === 'PGRST116') return { code: 'vault_credentials_rejected', message: 'A SUPABASE_SERVICE_ROLE_KEY configurada na Vercel não foi aceita pelo Supabase. Abra o Supabase → Settings → API → service_role, copie a chave e atualize a variável na Vercel; depois faça um novo deploy.' };
    if (code === 'PGRST202' || code === 'PGRST205') return { code: 'vault_schema_not_ready', message: 'O Supabase ainda não reconhece as funções do módulo de IA. Aguarde um minuto ou reaplique a migration ai_vault_rpc.' };
    return { code: 'internal_configuration_error', message: `Falha interna ao acessar a configuração segura de IA (código ${code}).` };
  }
  if (error instanceof Error && /invalid api key|failed to fetch|jwt/i.test(error.message)) {
    return { code: 'vault_credentials_rejected', message: 'A conexão do servidor com o Supabase foi recusada. Confira a SUPABASE_SERVICE_ROLE_KEY na Vercel e faça um novo deploy.' };
  }
  return { code: 'internal_configuration_error', message: 'Falha interna ao acessar a configuração segura de IA.' };
}

export async function GET() {
  const auth = await authorize();
  if (auth.error) return auth.error;
  if (!isVaultDatabaseConfigured()) {
    return NextResponse.json({ vaultReady: false, providers: getProviderCatalog(), configs: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  try {
    const configs = await listProviderConfigs();
    return NextResponse.json({ vaultReady: true, providers: getProviderCatalog(), configs }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ error: safe.message, code: safe.code }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 });
  const input = parsed.data;

  try {
    const bucket = input.action === 'test' || input.action === 'list_models' || input.action === 'save_activate' ? 'provider_network' : 'admin_mutation';
    if (!(await consumeAdminRateLimit(auth.user.id, bucket))) {
      return NextResponse.json({ error: 'Limite temporário de operações administrativas. Aguarde um minuto e tente novamente.' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'private, no-store' } });
    }
    if (input.action === 'disable' || input.action === 'delete') {
      if (!input.configId) return NextResponse.json({ error: 'Selecione uma configuração salva.' }, { status: 400 });
      const result = await setProviderConfigState({ id: input.configId, actorId: auth.user.id, operation: input.action });
      return NextResponse.json({ ok: true, ...result });
    }

    if (input.action === 'test' || input.action === 'list_models') {
      const saved = input.apiKey ? null : input.configId ? await getSavedProviderCredential(input.configId) : null;
      const provider = input.provider ?? saved?.provider;
      const model = input.model ?? saved?.model;
      const apiKey = input.apiKey ?? saved?.apiKey;
      if (saved && input.provider && input.provider !== saved.provider) return NextResponse.json({ error: 'A credencial selecionada pertence a outro provedor.' }, { status: 400 });
      if (!provider || !apiKey) return NextResponse.json({ error: 'Informe uma chave temporária ou selecione uma credencial salva.' }, { status: 400 });
      if (input.action === 'list_models') {
        const models = await listProviderModels(provider, apiKey);
        return NextResponse.json({ ok: true, models });
      }
      if (!model) return NextResponse.json({ error: 'Informe o identificador do modelo.' }, { status: 400 });
      try {
        await testProviderConnection({ provider, model, apiKey });
        if (input.configId && saved) await markProviderTestPassed(input.configId, auth.user.id);
        else await auditProviderTest({ actorId: auth.user.id, provider, model, task: input.task, success: true });
        return NextResponse.json({ ok: true, code: 'connected', message: `Conexão validada com ${provider} (${model}).` });
      } catch (error) {
        if (provider && model) {
          const safe = safeError(error);
          await recordProviderTestFailure({ provider, model, task: saved?.task ?? input.task, code: safe.code, actorId: auth.user.id, ...(saved && !input.apiKey && input.configId ? { configId: input.configId } : {}) }).catch(() => undefined);
        }
        throw error;
      }
    }

    if (input.action === 'save_activate') {
      if (!input.provider || !input.model) return NextResponse.json({ error: 'Selecione o provedor e informe um modelo.' }, { status: 400 });
      const saved = input.apiKey ? null : input.configId ? await getSavedProviderCredential(input.configId) : null;
      if (saved && saved.provider !== input.provider) return NextResponse.json({ error: 'A credencial selecionada pertence a outro provedor.' }, { status: 400 });
      const apiKey = input.apiKey ?? saved?.apiKey;
      if (!apiKey) return NextResponse.json({ error: 'Informe a credencial do provedor.' }, { status: 400 });
      try {
        await testProviderConnection({ provider: input.provider, model: input.model, apiKey });
      } catch (error) {
        const safe = safeError(error);
        await recordProviderTestFailure({ provider: input.provider, model: input.model, task: saved?.task ?? input.task, code: safe.code, actorId: auth.user.id, ...(saved && !input.apiKey && input.configId ? { configId: input.configId } : {}) }).catch(() => undefined);
        throw error;
      }
      const config = await persistTestedProviderConfig({
        provider: input.provider, model: input.model, task: input.task, apiKey, actorId: auth.user.id,
        makeDefault: true, capabilities: input.capabilities,
      });
      return NextResponse.json({ ok: true, message: `${config.displayName} validado, salvo no Vault e ativado para ${config.task}.`, config });
    }

    return NextResponse.json({ error: 'Operação não suportada.' }, { status: 400 });
  } catch (error) {
    const safe = safeError(error);
    const status = safe.code === 'invalid_credentials' || safe.code === 'model_not_found' || safe.code === 'rate_limit' || safe.code === 'insufficient_balance' || safe.code === 'invalid_request' ? 400 : 503;
    return NextResponse.json({ error: safe.message, code: safe.code }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
