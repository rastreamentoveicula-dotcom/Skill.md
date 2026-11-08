import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  prompt: z.string().trim().min(2).max(4000),
  project: z.object({
    name: z.string().max(160).default('Projeto sem título'),
    aspect: z.string().max(8).default('16:9'),
    scenes: z.array(z.object({
      title: z.string().max(160),
      description: z.string().max(2000),
      duration: z.number().min(0).max(600),
    }).strict()).max(40),
    characters: z.array(z.object({
      name: z.string().max(120),
      role: z.string().max(180),
      description: z.string().max(1200),
      personality: z.string().max(1200),
    }).strict()).max(40).default([]),
  }).strict(),
}).strict();

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Entre na sua conta para usar o agente.' }, { status: 401 });

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido. Reduza o texto ou revise o projeto.' }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'O agente ainda não está ativado: adicione GEMINI_API_KEY como variável secreta do projeto na Vercel.' }, { status: 503 });

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const { prompt, project } = parsed.data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40_000);
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Você é o agente criativo do Recriar Motion AI. Responda em português brasileiro, de forma prática e concisa. Ajude com roteiro audiovisual, direção visual, ritmo, enquadramento e movimentos de câmera. Não afirme que gerou imagens ou vídeos; entregue instruções textuais claras.' }] },
          contents: [{ role: 'user', parts: [{ text: `Projeto: ${project.name}\nProporção: ${project.aspect}\nCenas atuais: ${JSON.stringify(project.scenes)}\nPersonagens: ${JSON.stringify(project.characters)}\n\nPedido: ${prompt}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 429) return NextResponse.json({ error: 'O limite de uso do Gemini foi atingido. Tente novamente mais tarde.' }, { status: 429 });
      if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'A chave Gemini não foi aceita. Verifique a variável GEMINI_API_KEY na Vercel.' }, { status: 502 });
      return NextResponse.json({ error: `O Gemini não respondeu (HTTP ${response.status}). Tente novamente.` }, { status: 502 });
    }
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('').trim();
    if (!text) return NextResponse.json({ error: 'O Gemini retornou uma resposta vazia. Tente reformular o pedido.' }, { status: 502 });
    return NextResponse.json({ text }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json({ error: timedOut ? 'O agente demorou demais para responder. Tente novamente.' : 'Não foi possível conectar ao agente.' }, { status: timedOut ? 504 : 503 });
  }
}
