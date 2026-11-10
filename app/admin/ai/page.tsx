import Link from 'next/link';
import { redirect } from 'next/navigation';
import '../../account-settings.css';
import AISettingsPanel from './AISettingsPanel';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';
export default async function AISettingsPage() {
  const auth = await requireAdmin().catch(() => null);
  if (!auth?.user) redirect('/login?next=/admin/ai');
  if (!auth.authorized) redirect('/studio');
  return <main className="admin-dashboard"><header className="admin-dashboard-header"><Link className="admin-brand" href="/admin">← Painel administrativo</Link><Link className="admin-back-link" href="/studio">Voltar ao Studio</Link></header><section className="admin-dashboard-main"><p className="admin-eyebrow">CONFIGURAÇÕES · IA</p><h1>Provedores de IA</h1><p className="admin-muted">As chaves são criptografadas no servidor e nunca voltam para o navegador. Configure uma chave, teste a conexão e escolha o provedor ativo.</p><AISettingsPanel/></section></main>;
}
