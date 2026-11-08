import Link from 'next/link';
import { ArrowDown, ArrowRight, Bot, Clapperboard, Layers3, Play, Sparkles, WandSparkles } from 'lucide-react';

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav">
<Link className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>recriar<span className="brand-ai">motion ai</span></span></Link>
        <div><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a></div>
        <div className="landing-auth"><Link href="/login">Entrar</Link><Link className="landing-cta" href="/studio">Abrir Studio <ArrowRight size={14}/></Link></div>
      </nav>
      <section className="landing-hero">
        <div className="hero-glow"/>
        <div className="hero-copy">
          <div className="hero-pill"><Sparkles size={13}/> SEU ESTÚDIO CRIATIVO, AGORA COM IA</div>
          <h1>Uma ideia.<br/><span>Em movimento.</span></h1>
          <p>Transforme suas ideias em vídeos extraordinários com inteligência artificial. Planeje, componha e refine — tudo no mesmo espaço criativo.</p>
          <div className="hero-actions"><Link className="hero-primary" href="/studio">Conhecer o Motion Studio <ArrowRight size={16}/></Link><a className="hero-secondary" href="#como-funciona"><Play size={14}/> Ver como funciona</a></div>
          <div className="hero-footnote"><span/> Ambiente criativo em evolução · Exporte e continue seu projeto</div>
        </div>
        <div className="hero-product">
          <div className="product-window">
            <div className="product-top"><div className="window-dots"><i/><i/><i/></div><span>recriar <b>motion ai</b></span><small>MEU PROJETO <i>●</i></small></div>
            <div className="product-content">
              <div className="product-side"><span className="product-side-active"><Clapperboard size={14}/></span><Layers3 size={14}/><Bot size={14}/></div>
              <div className="product-workarea">
                <div className="product-script"><div className="product-label">ROTEIRO <span>03 CENAS</span></div><b>Uma ideia, em movimento.</b>
                  <div className="mini-scene selected"><i/><span><strong>01 · A primeira luz</strong><small>Uma esfera luminosa desperta...</small></span></div>
                  <div className="mini-scene"><i/><span><strong>02 · Ideias em movimento</strong><small>Traços de luz se conectam...</small></span></div>
                  <div className="mini-scene"><i/><span><strong>03 · Crie sem limites</strong><small>A energia se expande...</small></span></div>
                  <div className="mini-prompt"><Sparkles size={12}/> Conte sua próxima ideia <ArrowRight size={12}/></div>
                </div>
              </div>
              <div className="product-preview"><div className="preview-star">R</div><div className="preview-rings one"/><div className="preview-rings two"/><div className="preview-title">A PRIMEIRA LUZ</div><small>Uma nova história começa.</small><div className="preview-controls"><Play size={11} fill="currentColor"/><i/><span>00:02 / 00:15</span></div></div>
            </div>
            <div className="product-timeline"><div><span>00:00</span><span>00:05</span><span>00:10</span></div><div className="timeline-strips"><i/><i/><i/></div><div className="timeline-audio"><span/></div></div>
          </div>
          <div className="floating-note"><span><WandSparkles size={14}/></span><div><b>Seu fluxo criativo</b><small>Roteiro · cenas · timeline</small></div></div>
        </div>
      </section>
      <section className="landing-features" id="recursos">
        <div className="section-heading"><span>DO CONCEITO À COMPOSIÇÃO</span><h2>Um espaço para criar.<br/>E continuar criando.</h2></div>
        <div className="feature-grid">
          <article><div className="feature-icon"><Clapperboard size={18}/></div><h3>Motion Studio</h3><p>Organize cenas, roteiro e personagens em uma timeline clara. Ajuste a composição e acompanhe a sequência no preview.</p><Link href="/studio">Explorar o editor <ArrowRight size={14}/></Link></article>
          <article><div className="feature-icon pink"><Bot size={18}/></div><h3>Agente criativo</h3><p>Um copiloto para desenvolver ideias, planejar cenas e orientar a direção visual — com suas decisões no controle.</p><Link href="/studio">Conhecer o agente <ArrowRight size={14}/></Link></article>
          <article><div className="feature-icon green"><Layers3 size={18}/></div><h3>Seu projeto, sua estrutura</h3><p>Edite personagens, cenas e camadas em um fluxo conectado. Exporte a estrutura para continuar em outras ferramentas.</p><Link href="/studio">Começar um projeto <ArrowRight size={14}/></Link></article>
        </div>
      </section>
      <section className="landing-process" id="como-funciona">
        <div><span>UM FLUXO DE TRABALHO</span><h2>Da primeira frase<br/>ao próximo frame.</h2><p>Comece com um roteiro visual. Estruture cenas, personagens e ritmo. Continue refinando no Studio — sem perder o fio da ideia.</p><Link className="hero-primary" href="/studio">Abrir o Motion Studio <ArrowRight size={15}/></Link></div>
        <div className="process-list">
          <div><b>01</b><span><strong>Descreva sua ideia</strong><small>Comece pelo conceito, pelo roteiro ou por uma cena.</small></span><Sparkles size={16}/></div>
          <div><b>02</b><span><strong>Construa a sequência</strong><small>Organize cenas, duração, personagens e camadas.</small></span><Layers3 size={16}/></div>
          <div><b>03</b><span><strong>Refine no Studio</strong><small>Pré-visualize, ajuste e exporte a estrutura do projeto.</small></span><ArrowDown size={16}/></div>
        </div>
      </section>
      <footer className="landing-footer"><Link className="brand" href="/"><span className="brand-mark"><span/><span/><span/></span><span>recriar<span className="brand-ai">motion ai</span></span></Link><span>Um espaço para transformar ideias em movimento.</span><Link href="/login">Acessar sua conta <ArrowRight size={13}/></Link></footer>
    </main>
  );
}
