import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { decryptSecret } from '@/lib/secret-vault';
import { generateWithProvider, type AIProvider, DEFAULT_MODELS } from '@/lib/ai-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  prompt: z.string().trim().min(2).max(4000),
  project: z.object({
    name: z.string().max(160).default('Projeto sem título'),
    aspect: z.string().max(8).default('16:9'),
    scenes: z.array(z.object({ title: z.string().max(160), description: z.string().max(2000), duration: z.number().min(0).max(600) }).strict()).max(40),
    characters: z.array(z.object({ name: z.string().max(120), role: z.string().max(180), description: z.string().max(1200), personality: z.string().max(1200) }).strict()).max(40).default([]),
  }).strict(),
}).strict();

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Entre na sua conta para usar o agente.' }, { status: 401 });
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido. Reduza o texto ou revise o projeto.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCalls, error: rateError } = await admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).gte('created_at', since);
    if (rateError) return NextResponse.json({ error: 'Não foi possível verificar o limite de uso. Tente mais tarde.' }, { status: 503 });
    if ((recentCalls ?? 0) >= 20) return NextResponse.json({ error: 'Limite temporário: até 20 chamadas de IA por hora por usuário.' }, { status: 429 });
    const { data: configRow } = await admin.from('system_settings').select('value').eq('key', 'ai.provider.config').maybeSingle();
    const config = (configRow?.value ?? {}) as { activeProvider?: string; models?: Record<string, string> };
    const provider = config.activeProvider as AIProvider | undefined;
    if (!provider || !['gemini', 'openai', 'anthropic', 'openrouter'].includes(provider)) {
      return NextResponse.json({ error: 'O agente ainda não está ativado. Configure um provedor em Painel administrativo → Provedores de IA.' }, { status: 503 });
    }
    const { data: keyRow } = await admin.from('system_settings').select('value').eq('key', `ai.key.${provider}`).maybeSingle();
    const ciphertext = (keyRow?.value as { ciphertext?: string } | null)?.ciphertext;
    if (!ciphertext) return NextResponse.json({ error: `Cadastre a chave do provedor ${provider} no painel administrativo.` }, { status: 503 });
    const apiKey = decryptSecret(ciphertext);
    const model = config.models?.[provider] || DEFAULT_MODELS[provider];
    const { prompt, project } = parsed.data;
    const context = `Projeto: ${project.name}\nProporção: ${project.aspect}\nCenas atuais: ${JSON.stringify(project.scenes)}\nPersonagens: ${JSON.stringify(project.characters)}\n\nPedido: ${prompt}`;
    const result = await generateWithProvider({
      provider,
      model,
      apiKey,
      system: 'Você é o copiloto criativo do Recriar Motion AI. Responda em português brasileiro, de forma prática e concisa. Ajude com roteiro audiovisual, direção visual, ritmo, enquadramento e movimentos de câmera. Não afirme que gerou imagens ou vídeos; entregue instruções textuais claras.',
      prompt: context,
    });
    await admin.from('ai_usage_logs').insert({ owner_id: user.id, provider, model, task: 'creative_assistant', input_tokens: Number(result.usage?.promptTokenCount ?? result.usage?.input_tokens ?? 0), output_tokens: Number(result.usage?.candidatesTokenCount ?? result.usage?.output_tokens ?? 0), cost_micros: 0, status: 'success' });
    return NextResponse.json({ text: result.text, provider, model }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return NextResponse.json({ error: 'O agente demorou demais para responder. Tente novamente.' }, { status: 504 });
    const message = error instanceof Error ? error.message : 'Não foi possível conectar ao agente.';
    const status = message.includes('chave') || message.includes('permissões') ? 502 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
