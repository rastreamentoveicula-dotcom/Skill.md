'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, LoaderCircle, RefreshCw, Save, Trash2, Wifi, X } from 'lucide-react';

type Provider = 'gemini' | 'openai' | 'anthropic' | 'openrouter';
type Task = 'conversation' | 'planning' | 'script_generation' | 'image_analysis' | 'video_analysis';
type Capability = 'supported' | 'unsupported' | 'unknown';
type Model = { id: string; displayName: string; capabilities: { text: boolean; image: Capability; video: Capability } };
type Config = { id: string; provider: Provider; displayName: string; model: string; task: Task; enabled: boolean; isDefault: boolean; connectionStatus: 'not_configured' | 'pending' | 'connected' | 'error' | 'disabled'; lastTestedAt: string | null; lastError: string | null; capabilities: Model['capabilities'] };
type Settings = { vaultReady: boolean; configs: Config[]; providers: { provider: Provider; displayName: string; defaultModel: string }[] };

const providerNames: Record<Provider, string> = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude', openrouter: 'OpenRouter' };
const defaultModels: Record<Provider, string> = { gemini: 'gemini-3.8-flash', openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-latest', openrouter: 'openai/gpt-4o-mini' };
const tasks: { id: Task; label: string }[] = [
  { id: 'conversation', label: 'Conversação' }, { id: 'planning', label: 'Planejamento' },
  { id: 'script_generation', label: 'Geração de roteiro' }, { id: 'image_analysis', label: 'Análise de imagem' },
  { id: 'video_analysis', label: 'Análise de vídeo' },
];
const statusLabels: Record<Config['connectionStatus'], string> = { not_configured: 'Não testada', pending: 'Pendente', connected: 'Conectada', error: 'Erro no teste', disabled: 'Desativada' };

export default function AISettingsPanel() {
  const [settings, setSettings] = useState<Settings>({ vaultReady: false, configs: [], providers: [] });
  const [provider, setProvider] = useState<Provider>('gemini');
  const [task, setTask] = useState<Task>('script_generation');
  const [configId, setConfigId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(defaultModels.gemini);
  const [models, setModels] = useState<Model[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedConfig = useMemo(() => settings.configs.find(item => item.id === configId), [settings.configs, configId]);
  const providerConfigs = settings.configs.filter(item => item.provider === provider);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/admin/settings/ai', { cache: 'no-store' });
      const data = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as configurações.');
      setSettings(data);
      setConfigId(current => data.configs.some(item => item.id === current) ? current : '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const chooseProvider = (next: Provider) => {
    setProvider(next); setConfigId(''); setApiKey(''); setModel(defaultModels[next]); setModels([]); setError(''); setMessage('');
  };
  const chooseConfig = (id: string) => {
    const config = settings.configs.find(item => item.id === id);
    setConfigId(id); setApiKey(''); setModels([]); setError(''); setMessage('');
    if (config) { setProvider(config.provider); setTask(config.task); setModel(config.model); }
  };
  const request = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/settings/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'A operação falhou.');
    return data;
  };
  const run = async (action: 'test' | 'list_models' | 'save_activate' | 'disable' | 'delete', targetId = configId) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const selectedModel = models.find(item => item.id === model);
      const body: Record<string, unknown> = { action, provider, task, model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(targetId ? { configId: targetId } : {}), ...(selectedModel ? { capabilities: selectedModel.capabilities } : {}) };
      if (action === 'save_activate' && !apiKey.trim() && !targetId) throw new Error('Informe uma chave ou selecione uma credencial salva.');
      if ((action === 'test' || action === 'list_models') && !apiKey.trim() && !targetId) throw new Error('Informe uma chave temporária ou selecione uma credencial salva.');
      const data = await request(body);
      if (action === 'list_models') {
        setModels(data.models as Model[]);
        setMessage(`${(data.models as Model[]).length} modelos disponíveis.`);
      } else if (action === 'test') setMessage(data.message || `Conexão validada com ${providerNames[provider]} (${model}).`);
      else if (action === 'save_activate') {
        setMessage(data.message || 'Provedor validado e ativado.'); setApiKey(''); await load(true);
        if (data.config?.id) setConfigId(data.config.id);
      } else {
        setMessage(action === 'disable' ? 'Configuração desativada.' : 'Configuração removida.');
        setConfigId(''); await load(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao configurar o provedor.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="admin-settings-panel"><LoaderCircle className="spin"/> Carregando configurações…</div>;
  return <div className="admin-settings-panel">
    <div className="admin-provider-tabs">{(Object.keys(providerNames) as Provider[]).map(item => <button type="button" key={item} className={item === provider ? 'selected' : ''} onClick={() => chooseProvider(item)}>{providerNames[item]}{settings.configs.some(config => config.provider === item && config.enabled) && <span>Ativo</span>}</button>)}</div>
    {!settings.vaultReady && <div className="admin-warning">O acesso server-side ao Supabase Vault ainda não está configurado. O cadastro e a ativação estão bloqueados até SUPABASE_SERVICE_ROLE_KEY estar configurada como variável secreta de servidor.</div>}
    {error && <div className="account-message error">{error}</div>}{message && <div className="account-message success"><Check size={15}/>{message}</div>}
    <div className="admin-settings-card">
      <label>Configuração salva<select value={configId} onChange={e => chooseConfig(e.target.value)}><option value="">Nova configuração</option>{providerConfigs.map(config => <option key={config.id} value={config.id}>{config.model} · {tasks.find(item => item.id === config.task)?.label} · {statusLabels[config.connectionStatus]}</option>)}</select><small>Chaves existentes nunca são devolvidas ao navegador; uma configuração pode ser testada ou ativada sem revelar seu valor.</small></label>
      <label>Função<select value={task} onChange={e => setTask(e.target.value as Task)}>{tasks.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label>Identificador do modelo<input list="ai-provider-models" value={model} onChange={e => setModel(e.target.value)} maxLength={120} placeholder={defaultModels[provider]}/><datalist id="ai-provider-models">{models.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</datalist></label>
      <label>Chave secreta{selectedConfig && <small>Uma credencial está salva no Vault. Deixe vazio para reutilizá-la ou informe uma nova para substituí-la.</small>}<div className="secret-input-wrap"><input type={showKey ? 'text' : 'password'} autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={selectedConfig ? 'Credencial salva (oculta)' : 'Cole a API key'} /><button type="button" aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'} onClick={() => setShowKey(value => !value)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
      <div className="admin-settings-actions">
        <button type="button" className="account-secondary-button" disabled={busy || (!apiKey.trim() && !configId)} onClick={() => void run('list_models')}><RefreshCw size={15}/> Consultar modelos</button>
        <button type="button" className="account-secondary-button" disabled={busy || (!apiKey.trim() && !configId) || !model.trim()} onClick={() => void run('test')}><Wifi size={15}/> Testar conexão</button>
        <button type="button" className="account-primary-button" disabled={busy || !settings.vaultReady || (!apiKey.trim() && !configId) || !model.trim()} onClick={() => void run('save_activate')}><Save size={15}/> Testar, salvar e ativar</button>
        {selectedConfig && <><button type="button" className="account-secondary-button" disabled={busy || !settings.vaultReady} onClick={() => void run('disable')}><X size={15}/> Desativar</button><button type="button" className="admin-danger-button" disabled={busy || !settings.vaultReady} onClick={() => { if (window.confirm('Remover esta configuração e sua credencial dedicada do Vault?')) void run('delete'); }}><Trash2 size={15}/> Remover</button></>}
      </div>
      {selectedConfig?.lastError && <div className="admin-warning">Último erro registrado: {selectedConfig.lastError}</div>}
      {models.length > 0 && <div className="admin-dashboard-note">{models.find(item => item.id === model) ? `Capacidades do catálogo para este modelo — texto: ${models.find(item => item.id === model)?.capabilities.text ? 'sim' : 'não'}, imagem: ${models.find(item => item.id === model)?.capabilities.image}, vídeo: ${models.find(item => item.id === model)?.capabilities.video}.` : 'Selecione um modelo listado para consultar suas capacidades.'}</div>}
    </div>
    <div className="admin-settings-card"><h3>Configurações salvas</h3>{settings.configs.length === 0 ? <p className="admin-dashboard-note">Nenhum provedor configurado no Vault.</p> : <div className="admin-provider-tabs">{settings.configs.map(config => <button type="button" key={config.id} className={config.id === configId ? 'selected' : ''} onClick={() => chooseConfig(config.id)}>{providerNames[config.provider]} · {config.model}<span>{config.isDefault && config.enabled ? 'Padrão' : statusLabels[config.connectionStatus]}</span></button>)}</div>}</div>
    <p className="admin-dashboard-note">Credenciais são enviadas diretamente à API administrativa autenticada, armazenadas no Supabase Vault e lidas apenas no servidor. Os valores não são incluídos em respostas, logs ou armazenamento do navegador.</p>
  </div>;
}
