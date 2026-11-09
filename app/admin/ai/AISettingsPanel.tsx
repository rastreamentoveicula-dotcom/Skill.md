'use client';
import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, LoaderCircle, Save, Trash2, Wifi } from 'lucide-react';

type Provider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';
type Settings = { activeProvider: Provider; models: Record<Provider, string>; keys: Record<Provider, boolean>; encryptionReady: boolean };
const providerNames: Record<Provider, string> = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude', openrouter: 'OpenRouter' };
const defaultModels: Record<Provider, string> = { gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-latest', openrouter: 'openai/gpt-4o-mini' };
const allProviders = Object.keys(providerNames) as Provider[];

export default function AISettingsPanel() {
  const [settings, setSettings] = useState<Settings>({ activeProvider: 'gemini', models: defaultModels, keys: { gemini: false, openai: false, anthropic: false, openrouter: false }, encryptionReady: false });
  const [provider, setProvider] = useState<Provider>('gemini');
  const [activeChoice, setActiveChoice] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModels.gemini);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings/ai', { cache: 'no-store' });
      const data = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as configurações.');
      setSettings(data);
      setProvider(data.activeProvider);
      setActiveChoice(data.activeProvider);
      setModel(data.models[data.activeProvider] || defaultModels[data.activeProvider]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const choose = (next: Provider) => {
    setProvider(next); setModel(settings.models[next] || defaultModels[next]); setApiKey(''); setError(''); setMessage('');
  };
  const send = async (action: 'save' | 'test' | 'clear', activate = false, target: Provider = provider) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const targetModel = target === provider ? model : settings.models[target] || defaultModels[target];
      const response = await fetch('/api/admin/settings/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, provider: target, model: targetModel, apiKey: target === provider ? (apiKey || undefined) : undefined, activate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'A operação falhou.');
      setMessage(data.message || (action === 'clear' ? `Chave removida de ${providerNames[target]}.` : action === 'test' ? `Conexão validada: ${data.sample}` : `Configuração salva para ${providerNames[target]}.`));
      if (action !== 'test') { setApiKey(''); await load(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao configurar o provedor.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="admin-settings-panel"><LoaderCircle className="spin"/> Carregando configurações…</div>;
  return <div className="admin-settings-panel">
    <div className="admin-provider-tabs">{allProviders.map(item => <button key={item} className={item === provider ? 'selected' : ''} onClick={() => choose(item)}>{providerNames[item]}{settings.keys[item] && <span>Configurada</span>}</button>)}</div>
    {!settings.encryptionReady && <div className="admin-warning">O cofre ainda não está ativo: adicione `AI_SECRETS_ENCRYPTION_KEY` como segredo de servidor na Vercel e redeploye.</div>}
    {error && <div className="account-message error">{error}</div>}{message && <div className="account-message success"><Check size={15}/>{message}</div>}
    <div className="admin-settings-card">
      <div className="admin-settings-field"><label>Provedor ativo<select value={activeChoice} onChange={e => setActiveChoice(e.target.value as Provider)}>{allProviders.filter(item => settings.keys[item] || item === provider).map(item => <option key={item} value={item}>{providerNames[item]}{settings.keys[item] ? ' · chave salva' : ''}</option>)}</select></label><button className="account-secondary-button" disabled={busy || !settings.keys[activeChoice]} onClick={() => void send('save', true, activeChoice)}>Ativar {providerNames[activeChoice]}</button></div>
      <label>Identificador do modelo<input value={model} onChange={e => setModel(e.target.value)} maxLength={120} placeholder={defaultModels[provider]}/></label>
      <label>Chave secreta{settings.keys[provider] && <small>Uma chave já está salva. Deixe vazio para mantê-la ou informe uma nova para substituí-la.</small>}<div className="secret-input-wrap"><input type={showKey ? 'text' : 'password'} autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={settings.keys[provider] ? 'Chave salva (oculta)' : 'Cole a API key recém-gerada'} /><button type="button" aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'} onClick={() => setShowKey(value => !value)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
      <div className="admin-settings-actions"><button className="account-secondary-button" disabled={busy || (!apiKey && !settings.keys[provider])} onClick={() => void send('test')}><Wifi size={15}/> Testar conexão</button><button className="account-primary-button" disabled={busy || !settings.encryptionReady || (!apiKey && !settings.keys[provider])} onClick={() => void send('save')}><Save size={15}/> Salvar chave/modelo</button>{settings.keys[provider] && <button className="admin-danger-button" disabled={busy} onClick={() => void send('clear')}><Trash2 size={15}/> Remover</button>}</div>
    </div>
    <p className="admin-dashboard-note">Chaves são salvas com AES-256-GCM em segredo criptografado no Supabase, usando uma chave mestra exclusiva no servidor. Não reutilize chaves que já foram compartilhadas em conversas.</p>
  </div>;
}
