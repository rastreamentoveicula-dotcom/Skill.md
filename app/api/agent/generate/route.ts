import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { routeAIRequest, aiRouterErrorMessage } from '@/lib/ai-provider-router';
import { AIProviderError } from '@/lib/ai-providers';

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
  let ownerId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Entre na sua conta para usar o agente.' }, { status: 401 });
    ownerId = user.id;
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido. Reduza o texto ou revise o projeto.' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCalls, error: rateError } = await admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).gte('created_at', since);
    if (rateError) return NextResponse.json({ error: 'Não foi possível verificar o limite de uso. Tente mais tarde.' }, { status: 503 });
    if ((recentCalls ?? 0) >= 20) return NextResponse.json({ error: 'Limite temporário: até 20 chamadas de IA por hora por usuário.' }, { status: 429 });

    const { prompt, project } = parsed.data;
    const context = `Projeto: ${project.name}\nProporção: ${project.aspect}\nCenas atuais: ${JSON.stringify(project.scenes)}\nPersonagens: ${JSON.stringify(project.characters)}\n\nPedido: ${prompt}`;
    const result = await routeAIRequest({
      task: 'script_generation',
      system: 'Você é o copiloto criativo do Recriar Motion AI. Responda em português brasileiro, de forma prática e concisa. Ajude com roteiro audiovisual, direção visual, ritmo, enquadramento e movimentos de câmera. Não afirme que gerou imagens ou vídeos; entregue instruções textuais claras.',
      prompt: context,
    });
    await admin.from('ai_usage_logs').insert({ owner_id: user.id, provider: result.provider, model: result.model, task: 'creative_assistant', input_tokens: Number(result.usage?.promptTokenCount ?? result.usage?.input_tokens ?? 0), output_tokens: Number(result.usage?.candidatesTokenCount ?? result.usage?.output_tokens ?? 0), cost_micros: 0, status: 'success' });
    return NextResponse.json({ text: result.text, provider: result.provider, model: result.model }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (ownerId) {
      const admin = createSupabaseAdminClient();
      try { await admin.from('ai_usage_logs').insert({ owner_id: ownerId, provider: 'unavailable', model: 'unavailable', task: 'creative_assistant', status: 'error' }); } catch { /* usage logging must not mask the provider error */ }
    }
    const message = aiRouterErrorMessage(error);
    const status = error instanceof AIProviderError && error.code === 'timeout' ? 504
      : error instanceof AIProviderError && ['invalid_credentials','model_not_found','invalid_request','rate_limit','insufficient_balance'].includes(error.code) ? 502
      : 503;
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
