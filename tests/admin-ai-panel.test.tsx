// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AISettingsPanel from '@/app/admin/ai/AISettingsPanel';

type Json = Record<string, unknown>;

const providers = [
  { provider: 'gemini', displayName: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
  { provider: 'openai', displayName: 'OpenAI', defaultModel: 'gpt-4o-mini' },
];

function okSettings(vaultReady: boolean, configs: Json[] = []) {
  return new Response(JSON.stringify({ vaultReady, providers, configs }), { status: 200 });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: unknown, init?: RequestInit) => Promise.resolve(handler(String(input), init))));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('painel de configurações de IA', () => {
  it('carrega e mostra os provedores disponíveis', async () => {
    stubFetch(() => okSettings(true));
    render(<AISettingsPanel />);
    expect(screen.getByText(/Carregando configurações/)).toBeInTheDocument();
    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();
    expect(screen.queryByText(/ainda não está configurado/)).not.toBeInTheDocument();
  });

  it('mostra apenas a mensagem de erro quando o carregamento falha', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'A SUPABASE_SERVICE_ROLE_KEY configurada na Vercel não foi aceita pelo Supabase.' }), { status: 503 }));
    render(<AISettingsPanel />);
    expect(await screen.findByText(/não foi aceita pelo Supabase/)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não está configurado/)).not.toBeInTheDocument();
  });

  it('avisa quando o Vault não está pronto e bloqueia a ativação', async () => {
    stubFetch(() => okSettings(false));
    render(<AISettingsPanel />);
    expect(await screen.findByText(/ainda não está configurado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Testar, salvar e ativar/ })).toBeDisabled();
  });

  it('envia a credencial para salvar e ativar e confirma a operação', async () => {
    const user = userEvent.setup();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true, message: 'Google Gemini validado, salvo no Vault e ativado.', config: { id: 'c1' } }), { status: 200 });
      return okSettings(true);
    });
    render(<AISettingsPanel />);
    await screen.findByText('Google Gemini');
    const keyInput = screen.getByPlaceholderText('Cole a API key');
    await user.type(keyInput, 'sk-teste');
    await user.click(screen.getByRole('button', { name: /Testar, salvar e ativar/ }));

    expect(await screen.findByText(/validado, salvo no Vault/)).toBeInTheDocument();
    const post = calls.find(call => call.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body)) as Json;
    expect(body).toMatchObject({ action: 'save_activate', provider: 'gemini', apiKey: 'sk-teste' });
  });

  it('mantém a chave oculta e permite alternar a visibilidade', async () => {
    const user = userEvent.setup();
    stubFetch(() => okSettings(true));
    render(<AISettingsPanel />);
    await screen.findByText('Google Gemini');
    const keyInput = screen.getByPlaceholderText('Cole a API key');
    expect(keyInput).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar chave' }));
    expect(keyInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar chave' }));
    expect(keyInput).toHaveAttribute('type', 'password');
  });
});
