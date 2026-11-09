import Link from 'next/link';
import { redirect } from 'next/navigation';
import '../../account-settings.css';
import BillingSettings from './BillingSettings';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';
export default async function BillingPage() {
  const auth = await requireAdmin().catch(() => null);
  if (!auth?.user) redirect('/login?next=/admin/billing');
  if (!auth.authorized) redirect('/studio');
  return <main className="admin-dashboard"><header className="admin-dashboard-header"><Link className="admin-brand" href="/admin">← Painel administrativo</Link><Link className="admin-back-link" href="/studio">Voltar ao Studio</Link></header><section className="admin-dashboard-main"><p className="admin-eyebrow">CONFIGURAÇÕES · PAGAMENTOS</p><h1>Mercado Pago</h1><p className="admin-muted">Cadastre e valide credenciais de forma segura. Esta configuração ainda não ativa checkout ou cobrança recorrente; veja os requisitos pendentes abaixo.</p><BillingSettings/></section></main>;
}
