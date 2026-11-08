---
name: recriar-video-motion
description: Recebe um vídeo de referência (ou um áudio/roteiro) e recria tudo em motion design no contexto da Agents FX / FxCriativos, com a animação suave da marca, a 60 ou 120 fps. Aprende com cada nova referência e registra os aprendizados.
---

# Recriar vídeo em motion design (Agents FX / FxCriativos)

Você recebe um vídeo de referência (ou um áudio narrado com o texto/SRT) e entrega um vídeo NOVO, feito do zero em código (HTML/CSS/JS renderizado quadro a quadro), com a mesma estrutura, ritmo e energia da referência — mas modelado para a marca e o contexto do cliente. Nada da referência é copiado como imagem: só a ideia, a cadência e os tipos de cena.

## 0. Primeiro: carregar o que já foi aprendido
Antes de tudo, leia o arquivo de aprendizados do projeto (`claude/motion-learnings.md` via Projects `project_read`; se não existir, siga só esta skill). Ele tem preferências e correções novas do cliente que valem MAIS que esta skill quando conflitarem.

## 1. Contexto das marcas (padrão)
- **Agents FX** — agência de software e agents de IA para escritórios de advocacia (automação de prazos, processos, contratos, relatórios no WhatsApp). Sócios: Stiven Cortez e Felipe Pascarelli. Instagram @agents.fx. Tom: direto, premium, “Você descansa. O agent trabalha.”
- **FxCriativos** — braço de criativos/motion da mesma empresa (posts, carrosséis, reels, “diretor de Motion”). Palavra de comentário padrão: **MOTION** ou **FX**.
- Paleta: preto `#0A0A0F` / fundo escuro radial `#2A0F5C → #14072E → #07040F`, violeta `#7C3AED` / `#8B5CF6` / lavanda `#A78BFA`, lima `#C6F432`, branco `#FAFAFA`, cinza `#A1A1AA`; tema claro `#FBFBFC` com texto `#111114`.
- Fontes: Inter 400–700 (texto, “Apple-like”), Space Grotesk 700 (logo/wordmark). npm: `@fontsource/inter`, `@fontsource/space-grotesk`.
- Símbolo: `symbol.svg` (anéis com rastro + “FX”; X violeta no claro). No escuro, recolorir anéis/F para branco e X para lima.
- Se o pedido for para outro cliente (ex.: advogado), use a marca/cores dele e mantenha o estilo de animação.

## 2. Regras de estilo (inegociáveis — aprendidas com o cliente)
1. **Curva de entrada “overshoot suave”**: rápida no início, passa ~8% do alvo por volta de 60% do tempo e assenta no final. `bo=u=>{const c1=1.5,c=c1+1,v=u-1;return 1+c*v*v*v+c1*v*v}`. Saídas e movimentos de câmera: ease-in-out (`c3`). Nunca animação “seca”.
2. **Textos em escadinha com motion blur estilo Apple, centralizados**: palavra por palavra (ou letra por letra em títulos curtos), entrando de baixo com blur → nítido; no tema claro, cinza `#A8A8AE` → `#111114`. O texto **não se mexe depois de pousar**.
3. **Nunca sobrepor palavras** (nem eco/ghost atrás, nem padrão de letras no fundo atrás de título). Ecos empilhados só com espaçamento ≥ 1× o tamanho da fonte. Folga mínima de 24 px entre blocos; margem 60 px das bordas.
4. **Cada ideia numa cena própria**: quando a fala lista coisas (“suaviza, muda a cor, desacelera”), cada item ganha título centralizado + uma demonstração visual grande (gráfico, forma, objeto). Nada de listas apertadas.
5. **Continuidade**: cenas se transformam (zoom através de botão, whip com blur, objeto que derrete/vira outro, flash cinza de 2 frames, escurecer em degraus).
6. **Botões apertados**: mão branca (ou cursor roxo/ponto cinza) + efeito **liquid glass** (lente com borda brilhante, refração, “gelatina” ~0,7 s) + leve squash.
7. **Primeiro frame limpo**. Fluidez: 60 fps com blend de 2 frames, ou **120 fps** puro quando pedido.
8. **Marca d’água natural**: nome da marca em arquivo enviado no chat (“FxCriativo.mp4”), perfil no celular, cabeçalho de documento, nomes de clientes reais quando fornecidos.
9. **Mistura de estilos** (padrão aprovado): alternar **claro Apple** (cards brancos, iMessage, ecos de palavra, balão preto que vira, botão com contorno desenhando) e **escuro neon** (feixes roxos, títulos caixa-alta com sombra roxa, rabiscos neon, cards 3D, horizonte de luz embaixo de barra de prompt). Escolha por cena conforme o sentido (dor → escuro; explicação → claro).

## 3. Conteúdo e direitos
- Recrie, não copie: sem logos/marcas de terceiros (ChatGPT, Instagram, Adobe, WhatsApp etc.) → ícones genéricos ou texto. Não desenhe personagens/logos protegidos.
- Imagens: use as artes/fotos que o cliente enviar (criativos da agência, foto dele). Sem imagem → crie artes simples em CSS ou emoji (Noto Color Emoji).
- Trilha da referência provavelmente tem direitos: use se o cliente pedir, mas SEMPRE entregue também a versão sem áudio e avise em uma linha.
- Preços/números da referência: mantenha só se o cliente confirmar; sinalize na entrega.
- Publicidade de advocacia (OAB, Provimento 205/2021): sem promessa de resultado, preço, ou autoengrandecimento no texto adicionado.

## 4. Pipeline

### 4.1 Analisar a referência (quadro a quadro)
```bash
mkdir -p job/ref/g15 && cp <video> job/ref/ref.mp4 && cd job/ref
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact ref.mp4
ffmpeg -y -i ref.mp4 -vn -ac 2 -ar 48000 trilha.wav
ffmpeg -i ref.mp4 -vf "fps=15,scale=180:320,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='%{eif\:t\:d}.%{eif\:mod(t*100\,100)\:d\:2}':x=4:y=4:fontsize=22:fontcolor=red" g15/%03d.png
n=$(ls g15|wc -l); for i in $(seq 0 $(( (n-1)/60 ))); do ffmpeg -y -start_number $((i*60+1)) -i g15/%03d.png -frames:v 1 -vf "tile=10x6:padding=2:color=red" s15_$i.png; done
```
Olhe TODAS as folhas (15 fps = um quadro a cada 0,066 s). Escreva a lista de cenas: início/fim, o que entra, de onde, com que blur/escala, como sai, posição (coordenadas em px de 1080×1920 = tile×6). Detecte batidas para alinhar cortes:
```python
import numpy as np,scipy.io.wavfile as w
sr,a=w.read('trilha.wav');a=a.astype(float).mean(1);a/=abs(a).max();h=512
e=np.array([np.sqrt((a[i*h:(i+1)*h]**2).mean()) for i in range(len(a)//h)]);d=np.maximum(0,np.diff(np.log(e+1e-4)))
print([round((i+1)*h/sr,2) for i in range(1,len(d)-1) if d[i]>.8 and d[i]>=d[i-1] and d[i]>=d[i+1]])
```

### 4.2 Se vier áudio narrado
Precisa do tempo de cada palavra. Tente `pip install --break-system-packages faster-whisper` + modelo `small`; se o download for bloqueado (rede), **não contorne**: peça o roteiro com tempos ou um .srt (CapCut exporta). Converta para `words.js` (`[{w,s,e}]`) e sincronize cada palavra em escadinha com `t = s - 0.05`.

### 4.3 Roteiro de recriação
Para cada cena da referência, defina o equivalente no contexto da marca (ex.: “Fábrica de posts” → FxCriativos; “Pix enviado” → relatório no WhatsApp; mapa de terceiros → tela genérica). Mostre a lista curta ao cliente só se ele estiver presente e o trabalho for longo; senão siga e liste as trocas na entrega.

### 4.4 Página de animação (`job/index.html`, servir com `python3 -m http.server <porta>`)
Motor base (copie):
```js
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),lerp=(a,b,t)=>a+(b-a)*t;
const c3=u=>u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2, sn=u=>-(Math.cos(Math.PI*u)-1)/2;
const bo=u=>{const c1=1.5,c=c1+1,v=u-1;return 1+c*v*v*v+c1*v*v};
const E={lin:u=>u,expo:bo,io:c3,out:c3,inn:c3,sine:sn,back:bo};
// motion blur direcional: gere mh1..24 (stdDeviation n*2 0) e mb1..24 (0 n*2) num <defs>
const fns=[],on=f=>fns.push(f),KS=[];
function mk(html,css={},parent=cam){const d=document.createElement('div');d.className='a';d.innerHTML=html;Object.assign(d.style,css);parent.appendChild(d);return d}
function K(el,keys){const st={x:0,y:0,s:1,sx:1,r:0,rx:0,ry:0,o:1,b:0};KS.push({el,ks:keys.map(([t,p,e])=>{Object.assign(st,p);return{t,p:{...st},e:E[e||'expo']}})});return el}
function val(ks,t){if(t<ks[0].t)return null;if(t>=ks.at(-1).t)return ks.at(-1).p;let i=0;while(t>=ks[i+1].t)i++;const A=ks[i],B=ks[i+1],u=B.e(clamp((t-A.t)/(B.t-A.t)));const p={};for(const k in A.p)p[k]=lerp(A.p[k],B.p[k],u);return p}
function mbF(p,q,x=0){const lh=Math.min(24,Math.round(Math.abs(q.x-p.x)*240/330)),lv=Math.min(24,Math.round(Math.abs(q.y-p.y)*240/330)),bi=Math.min(14,Math.abs(q.s-p.s)*1680)+x;let f='';if(lh)f+=`url(#mh${lh}) `;if(lv)f+=`url(#mb${lv}) `;if(bi>.4)f+=`blur(${bi.toFixed(1)}px)`;return f||'none'}
function evalK(o,t){const p=val(o.ks,t);if(!p||p.o<=.003){o.el.style.display='none';return}const q=val(o.ks,t+1/240)||p;o.el.style.display='';o.el.style.opacity=clamp(p.o);
 o.el.style.transform=`translate(-50%,-50%) translate(${p.x}px,${p.y}px) perspective(1600px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotate(${p.r}deg) scale(${p.s*p.sx},${p.s})`;if(!o.el.__keepF)o.el.style.filter=mbF(p,q,p.b)}
// escadinha: rv(span,t0,{dy:40,bl:14,from:'#A8A8AE',to:'#111114'})
const RV=[];function rv(el,t0,o={}){el.classList.add('w');RV.push({el,t0,d:(o.d??.22)*1.35,bl:o.bl??14,dy:o.dy??0,dx:o.dx??0,sc:o.sc??0,t1:o.t1??1e9,from:o.from,to:o.to});return el}
const hx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
on(t=>{for(const w of RV){const p=(t-w.t0)/w.d;if(p<0){w.el.style.opacity=0;continue}const e=bo(clamp(p)),q=clamp((t-w.t1)/.22);
 w.el.style.opacity=sn(clamp(p*1.6))*(1-q);const b=(1-clamp(e))*w.bl+q*10;w.el.style.filter=b>.3?`blur(${b.toFixed(1)}px)`:'none';
 w.el.style.transform=`translate(${(1-e)*w.dx}px,${(1-e)*w.dy-q*30}px) scale(${1+(1-e)*w.sc})`;
 if(w.from){const A=hx(w.from),B=hx(w.to),u=clamp(p*1.3);w.el.style.color=`rgb(${A.map((a,i)=>Math.round(lerp(a,B[i],u)))})`}}});
const words=(s,c='')=>s.split(' ').map((w,i)=>`${i?' ':''}<span class="w ${c}">${w}</span>`).join('');
window.renderFrame=t=>{for(const o of KS)evalK(o,t);for(const f of fns)f(t)};
// no fim: await document.fonts.ready; window.__ready=true;
```
CSS base: `.a{position:absolute;left:540px;top:960px;white-space:nowrap}` `span.w{display:inline-block}` — coordenadas dos K são relativas ao centro da tela (1080×1920).

Biblioteca de cenas já validadas (recrie conforme a necessidade): pílula que nasce larga e encolhe; ecos de palavra (3 tons de cinza); balão preto que vira em 3D; barra de prompt escura com horizonte de luz violeta e texto digitado que rola + mão apertando enviar; iMessage (bolhas, “digitando…”, arquivo “FxCriativo.mp4”, emoji reagindo); card 3D “Crie seu Post”; calendário 3D que derrete (`feTurbulence`+`feDisplacementMap`) em relógio; contador de números; celular com post (criativo do cliente); colagem de criativos voando; anel neon ondulando; estrela/rabisco neon desenhando (`pathLength=100` + `stroke-dashoffset`); gráfico de curva linear→S com bolinha; forma que troca de cor; bola desacelerando com rastro; botão com contorno desenhando + cursor + liquid glass; editor de código digitando + filme renderizando com contador de quadros; logo FX se desenhando (anéis por stroke, F/X surgindo).

### 4.5 Testar antes de renderizar tudo
`render.mjs` (Playwright já instalado; Chromium em `/opt/pw-browsers/chromium-*/chrome-linux/chrome`): abre a página, espera `__ready`, chama `renderFrame(f/FPS)` e tira screenshot por quadro; aceita faixa `a b dir` ou lista `a,b,c x dir`. Renderize ~15–20 quadros-chave com `FPS=100`, monte contact sheet e **olhe**: sobreposição, cortes nas bordas, legibilidade, centralização.

### 4.6 Render final
- Rode 4–5 processos em paralelo em background (`nohup … &`) dividindo os quadros; acompanhe com `ls frames | wc -l`.
- O Chromium às vezes fecha no meio: ao final, liste os quadros faltando e renderize só esses.
- Mudou uma cena depois? Re-renderize apenas a faixa de quadros dela (o processo carrega a página no início — mate e reinicie jobs que ainda vão passar pela faixa alterada).
- Montagem:
  - 60 fps (render a 120 + blend): `-framerate 120 -vf "tmix=frames=2,select='not(mod(n\,2))',setpts=N/60/TB,format=yuv420p" -r 60`
  - 60 fps direto: `-framerate 60 … -pix_fmt yuv420p`
  - 120 fps: `-framerate 120 … -pix_fmt yuv420p -r 120` (avise que o Instagram exibe até 60).
  - Áudio: voz `highpass=f=70,loudnorm=I=-14:TP=-1:LRA=11`; trilha `-shortest`.

### 4.7 Checagem e entrega
Contact sheet do MP4 final inteiro (1,5–3 fps). Entregue com nome da marca (`FxCriativos-….mp4`), versão sem áudio se usou trilha de terceiros, e uma mensagem curta: o que foi recriado, o que foi trocado da referência, o que o cliente precisa confirmar.

## 5. Auto-aprimoramento (obrigatório a cada trabalho)
1. Depois de cada entrega e de cada correção do cliente, acrescente ao `claude/motion-learnings.md` do projeto (Projects `project_read` → editar → `project_write`) uma linha datada por aprendizado: preferência nova, erro corrigido, cena nova que funcionou (com o trecho de código-chave se for reutilizável), tempos/curvas aprovados.
2. Formato: `- AAAA-MM-DD · [estilo|regra|cena|pipeline] · aprendizado em uma frase`.
3. Não duplique: se já existe, refine a linha.
4. Quando 3+ aprendizados novos se acumularem ou o cliente pedir, proponha a atualização desta skill (`propose_skills`, kind `improvement`, SKILL.md completo) incorporando-os nas seções 2 e 4.4.
5. Toda nova referência que o cliente mandar: depois de analisar, anote no learnings o que ela tem de diferente (tipo de transição, tipografia, ritmo) e passe a usar nos próximos vídeos.
