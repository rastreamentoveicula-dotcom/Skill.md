import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  let auth;
  try {
    auth = await requireAdmin();
  } catch {
    return (
      <main className="admin-dashboard">
        <section className="admin-dashboard-card">
          <p className="admin-eyebrow">RECRIAR MOTION AI</p>
          <h1>Painel administrativo</h1>
          <p className="admin-muted">Não foi possível conectar ao Supabase. Verifique a configuração e tente novamente.</p>
          <Link className="admin-link-button" href="/login?next=/admin">Entrar novamente</Link>
        </section>
      </main>
    );
  }

  if (!auth.user) redirect('/login?next=/admin');
  if (!auth.authorized) redirect('/studio');

  return (
    <main className="admin-dashboard">
      <header className="admin-dashboard-header">
        <Link className="admin-brand" href="/">recriar <span>motion ai</span></Link>
        <Link className="admin-back-link" href="/studio">Voltar ao Studio</Link>
      </header>
      <section className="admin-dashboard-main">
        <p className="admin-eyebrow">ÁREA RESTRITA · ADMINISTRADOR</p>
        <h1>Painel administrativo</h1>
        <p className="admin-muted">Acesso autenticado para <strong>{auth.user.email}</strong>.</p>
        <div className="admin-dashboard-grid">
          <Link className="admin-dashboard-tile" href="/admin/sound-fx">
            <span className="admin-tile-icon">♫</span>
            <span><strong>Biblioteca Sound FX</strong><small>Importe, revise direitos e gerencie o catálogo de áudio.</small></span>
            <span className="admin-tile-arrow">→</span>
          </Link>
          <Link className="admin-dashboard-tile" href="/admin/ai">
            <span className="admin-tile-icon">✦</span>
            <span><strong>Provedores de IA</strong><small>Cadastre e valide chaves protegidas para o agente.</small></span>
            <span className="admin-tile-arrow">→</span>
          </Link>
          <Link className="admin-dashboard-tile" href="/settings">
            <span className="admin-tile-icon">◎</span>
            <span><strong>Minha conta</strong><small>Perfil, email, senha e foto do usuário.</small></span>
            <span className="admin-tile-arrow">→</span>
          </Link>
          <Link className="admin-dashboard-tile" href="/admin/billing">
            <span className="admin-tile-icon">R$</span>
            <span><strong>Pagamentos</strong><small>Configuração segura do provedor e status do checkout.</small></span>
            <span className="admin-tile-arrow">→</span>
          </Link>
          <Link className="admin-dashboard-tile" href="/studio">
            <span className="admin-tile-icon">▶</span>
            <span><strong>Motion Studio</strong><small>Abra o editor e continue criando projetos.</small></span>
            <span className="admin-tile-arrow">→</span>
          </Link>
        </div>
        <p className="admin-dashboard-note">Seu acesso administrativo é validado pela função <code>admin</code> no Supabase — não apenas pelo endereço de email.</p>
      </section>
    </main>
  );
}
