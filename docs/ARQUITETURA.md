# Recriar Motion AI — auditoria e arquitetura inicial

## Fase 1 — inventário e auditoria

O ZIP `recriar-video-motion.zip` foi validado (`Zip integrity: OK`) e contém exatamente:

| Arquivo | Tamanho | O que faz | Reutilização e limites |
|---|---:|---|---|
| `recriar-video-motion/SKILL.md` | 13.325 bytes | Briefing de criação audiovisual: análise por quadros, curva overshoot, texto em escadinha, continuidade, regras de direitos, montagem FFmpeg e revisão | Preservado em `docs/original/SKILL.md`. Pode fundamentar prompts/roteiros, mas contém contexto Agents FX/FxCriativos específico que não deve ser imposto a clientes diferentes. Referencia ferramentas `Projects`, `project_read/write` e `propose_skills`, indisponíveis neste produto; exigem adaptação. |
| `recriar-video-motion/render.mjs` | 1.175 bytes | Abre `index.html` local com Playwright, executa `window.renderFrame(t)` e salva screenshots PNG para cada quadro/intervalo | Preservado em `docs/original/render.mjs`. É renderizador de quadros, não pipeline completo MP4. Amarra-se a `/opt/pw-browsers`, `localhost`, viewport 1080×1920 e exige uma página com `__ready`/`renderFrame`. Não valida caminhos/entradas, não tem fila, FFmpeg, áudio, upload, timeout ou tratamento transacional. Não foi executado: Chromium, FFmpeg e uma composição de teste não foram fornecidos/validados nesta fase. |
| `recriar-video-motion/symbol.svg` | 4.029 bytes | Símbolo FX: rastros circulares, letras F/X, preto e roxo | Preservado em `docs/original/symbol.svg`. Marca FX não é identidade da plataforma. Evitamos copiar a marca; adotamos um símbolo orbital abstrato próprio em CSS. |
| Imagem VEOStudio | imagem JPEG fornecida | Referência de layout: shell escuro, navegação estreita, roteiro, preview central, elenco e timeline de múltiplas faixas | Preservada em `docs/reference-veostudio.jpg`. Usada apenas como referência de estrutura visual, sem usar logo/imagens/personagens de terceiros como ativos do produto. |

### Leitura da referência visual

A imagem enviada mostra um editor dark em proporção desktop, com barra superior central, trilho de navegação estreito à esquerda, roteiro em coluna lateral, grande preview central, personagens à direita e timeline horizontal ocupando a base. A timeline da referência inclui vídeo em miniaturas, faixa de áudio em forma de onda e camadas de IA separadas. A implementação atual aproxima essa hierarquia em CSS responsivo, substitui VEOStudio por identidade orbital original e usa arte abstrata criada em CSS no preview — não reutiliza o frame de ficção científica nem os personagens retratados na referência. Algumas faixas do editor ainda são estruturais e anunciam que não há mídia carregada.

## Arquitetura proposta

- **Next.js App Router + TypeScript**: páginas públicas, editor, endpoints de curta duração e callbacks. Vercel não renderiza vídeos longos.
- **Supabase Auth/Postgres/Storage**: sessões SSR; tabelas com RLS; Storage privado por pasta de usuário; URLs assinadas de curta duração.
- **Aplicação**: `app/` rotas; `components/` UI; `lib/` clientes e tipos; regras de domínio em serviços server-only (em expansão).
- **Agente**: adaptadores de provedor (OpenAI/Gemini/Anthropic/OpenRouter) atrás de interface comum. Planejamento JSON validado; ferramentas do agente chamam serviços autorizados com `user_id` da sessão — nunca SQL arbitrário. Plano/revisão antes de efeitos colaterais.
- **Fila**: tabela Postgres + função `claim_render_job` com `FOR UPDATE SKIP LOCKED`; workers concorrentes independentes. Idempotência, tentativas limitadas, estados e reserva de créditos. Evolução possível para Redis sem mudar o contrato do job.
- **Worker isolado**: imagem de contêiner Node/Chromium/FFmpeg, armazenamento temporário restrito, limite de CPU/memória/tempo; render de HTML/CSS/JS controlado e snapshot validado, sem executar JS arbitrário do usuário. Armazena outputs em bucket privado; callback autenticado.
- **Pagamentos**: backend cria checkout/assinatura Mercado Pago; webhook valida evento, consulta a API do provedor, deduplica e só então ativa plano/credita. Retorno do browser nunca autoriza pagamento.
- **Observabilidade**: logs com correlation ID sem secrets/PII desnecessária; health check do worker e métricas a integrar.

### Fluxos de dados e segurança

**Auth**: signup/login/reset via Supabase Auth → cookies de sessão SSR gerenciados por `@supabase/ssr` → middleware renova a sessão e protege `/studio` quando Supabase está configurado → APIs privadas chamam `getUser()` no servidor → RLS limita linhas a `auth.uid()`. Papel admin é atribuído apenas via serviço confiável e auditado; nunca via metadata editável pelo usuário.

**Projeto**: usuário autenticado cria `projects` com owner fixado na sessão; operações CRUD conferem ownership e RLS. `/api/projects` usa a RPC `save_project_snapshot` para salvar o projeto, cenas e personagens como operação PostgreSQL atômica. Sem credenciais Supabase, o editor offline salva no `localStorage` e oferece exportação JSON; isso não sincroniza com uma conta.

**Créditos e pagamento**: checkout cria operação `pending`, sem conceder plano. Webhook idempotente valida assinatura/origem e consulta provedor; numa transação registra evento, pagamento, assinatura, ledger e saldo. Render reserva saldo atomicamente; sucesso move reservado para consumido; falha elegível libera reserva. Cliente não possui permissão de mutar carteira, ledger, pagamento ou assinatura.

**Render**: request autenticado → valida projeto/limites/custo → cria job idempotente e reserva → worker reivindica atomicamente → baixa somente assets autorizados → compõe/encode MP4 → envia saída privada → finaliza ledger/job. URL de saída é assinada após autorização. Timeouts e cancelamento liberam créditos de acordo com estado efetivo.

**Agente**: prompt de sistema derivado da Skill adaptada (`lib/motion-skill.ts`) + contexto mínimo de projeto + conversa → modelo responde texto/plano estruturado → schema valida → mostra resumo/solicita confirmação → backend valida owner, limites e créditos → ferramentas auditáveis alteram projeto. Uploads enviados a modelos só com consentimento e políticas de retenção documentadas.

## Esquema inicial

A migration `supabase/migrations/202611080001_initial_schema.sql` define as 29 entidades solicitadas e principais vínculos:

- Identidade/RBAC: `profiles`, `user_roles`.
- Comercial: `subscription_plans`, `subscriptions`, `payment_transactions`, `payment_webhook_events`, `coupons`, `coupon_redemptions`.
- Crédito: `credit_wallets`, `credit_transactions`, `credit_costs`.
- Criação: `projects`, `project_versions`, `scenes`, `characters`, `media_assets`, `timeline_tracks`, `timeline_clips`.
- Execução: `render_jobs`, `render_outputs`.
- IA: `ai_conversations`, `ai_messages`, `ai_usage_logs`, `ai_provider_configs`.
- Operação: `system_settings`, `announcements`, `support_tickets`, `audit_logs`, `notifications`.

PKs UUID, FKs, checagens de estados/valores, índices de fila/consulta, timestamps, trigger de perfil/carteira, RLS em todas as tabelas e policies de ownership/admin. Há chaves estrangeiras compostas para impedir relacionar timeline/clipes/assets/jobs de projetos pertencentes a outras contas. O bucket segue privado: assets pessoais ficam sob pasta UUID; Sound FX usa caminhos `system/sound-fx/...` sem leitura direta por clientes e operações mediadas por URLs assinadas geradas no servidor. A migration Sound FX (`202611080002_sound_fx_library.sql`) adiciona catálogo, categorias, favoritos pessoais, curadoria global, direitos e campos de clipes. A RPC `save_project_snapshot` foi substituída por upsert de cenas/personagens estáveis para não cascatar clipes de áudio em cada autosave. As migrations ainda precisam de execução/validação em Supabase real, revisão independente de segurança e testes RLS adversariais com duas contas antes de produção; não executar em produção sem revisar e fazer backup.

## Sound FX Library

A UI de referência enviada pelo proprietário está preservada em `docs/reference-soundfx-library.jpg` e `docs/reference-soundfx-player.jpg`. No Studio, `components/SoundFxLibrary.tsx` consulta `/api/sound-categories`, `/api/sound-effects` e favoritos; apresenta filtros, waveform de 128 picos extraída no navegador, mini-player e inserção explícita na cena/playhead. Waveform/listagem não usam amostras fictícias: sem Supabase/migration, a UI mostra erro ou catálogo vazio.

A administração `/admin/sound-fx` (RBAC via `user_roles.role='admin'`) importa até 50 arquivos por lote, no máximo 25 MiB cada/100 MiB no lote. O backend emite tokens de upload temporários para `motion-media`; o navegador transfere bytes diretamente ao Storage, sem passar o áudio pelo limite de body de uma função Vercel. `/api/admin/sound-fx/complete` baixa o objeto com Service Role server-only, confere assinatura real via `file-type`, formato/duração via `music-metadata`, tamanho e SHA-256, então move para caminho privado estável e registra metadados. Clipes recém-importados permanecem inativos; ativar exige titular e licença identificados, permissões comercial e redistribuição marcadas. Busca do cliente e função SQL `search_sound_effects` obedecem RLS e uma filtragem adicional explícita de licença; player/timeline recebem URLs assinadas de playback de 90 segundos, não links permanentes do Drive.

O seed inclui somente as 12 categorias solicitadas. Nenhuma categoria foi inferida para os arquivos. `user_sound_favorites` é por usuário; `is_featured` é curadoria global da administração. A API exclui objetos apenas se não houver referência; assets usados em timeline são arquivados. Endpoints de timeline e RPCs cobrem inserir, mover, duplicar, cortar, trim, volume, fades e exclusão. A reprodução de áudio no preview do navegador segue o playhead com offsets, volume/fades; **isso não implementa nem valida composição de áudio no MP4 final**.

### Google Drive e direitos

A conexão Google Drive autorizada do agente listou 29 entradas, todas `audio/wav`. O inventário dos nomes e tamanhos retornados está em `docs/soundfx-drive-inventory.md`. Os bytes não foram baixados nem copiados para o Storage nesta fase; por isso duração, hashes e waveforms não foram examinados. Titularidade/licença/redistribuição não se deduzem dos nomes, e nenhum item foi ativado. O produto ainda não possui OAuth Google Drive; sincronização automática exige implementar uma integração consentida e token server-side. Agora os WAVs podem ser importados manualmente pelo painel admin após download autorizado, indicando origem e revisando os direitos.

## Estado de produto e não implementado

A fundação UI oferece edição de cenas/personagens, preview ilustrativo com controle de tempo/razão, arrastar/reordenar cenas, dividir/excluir, zoom, exportação JSON e autosave. Sem Supabase, o estado de projeto fica no navegador (`localStorage`); Sound FX remoto não é simulado. Com Supabase e migrações aplicadas, o CRUD remoto e os endpoints Sound FX usam sessão/RLS; a timeline faz playback sincronizado no navegador. O preview visual continua ilustrativo, não vídeo renderizado. O agente/LLM está conectado por `/api/agent/generate` (provedor ativo em `/admin/ai`, prompt em `lib/motion-skill.ts`) e responde apenas com texto; `/api/agent/tools/search_sound_effects` e o RPC `add_sound_effect_to_scene` continuam sendo contratos de domínio que o agente ainda não chama sozinho. A inserção atual ocorre pelo botão explícito da biblioteca; ainda não há recomendações geradas, justificativa de posicionamento nem fluxo de confirmação mediado por um modelo. Mercado Pago, OAuth Drive, histórico remoto, worker Chromium/FFmpeg e render final com mixagem seguem pendentes. As migrations e políticas não foram executadas em banco real nesta sessão.

## Cronograma técnico por fase

1. **Auditoria** (concluída nesta entrega): ZIP íntegro e arquivos examinados integralmente; referência visual avaliada; lógica e limitações documentadas. O render original não foi executado.
2. **Fundação** (parcial): Next.js/TypeScript, identidade visual, login/cadastro/recuperação Supabase SSR, middleware e migration versionada; requer credenciais e teste de RLS real. Ainda sem seed comercial.
3. **Painel** (parcial): CRUD/autosave remoto de projetos, cenas e personagens sob sessão; biblioteca Sound FX privada e painel admin implementados, enquanto biblioteca de mídia geral/notificações remotas continuam pendentes.
4. **Motion Studio** (parcial): editor visual responsivo, preview ilustrativo, cenas/personagens e Sound FX timeline com controle de playback no navegador; renderer final sincronizado, outras tracks/assets e exportação MP4 pendentes.
5. **Motor**: portar renderer para caminhos/configuração validada; contêiner Chromium/FFmpeg, fila, retry, healthcheck e teste MP4 end-to-end.
6. **Agente**: provider interface, roteamento, chat streaming, ferramentas tipadas/consentimento/custos.
7. **Financeiro**: planos configuráveis, ledger/créditos, Mercado Pago checkout/webhooks/testes de idempotência.
8. **Admin** (parcial): RBAC básico e gestão Sound FX por `/admin/sound-fx`; dashboards globais e auditoria operacional abrangente pendentes.
9. **Segurança/QA**: RLS adversarial multiusuário, rate limiting, upload, pagamentos, e2e e revisão externa.
10. **Publicação**: secrets na Vercel/Supabase/worker, deploy e verificação explícita de URLs, monitoramento/backup.

Nenhum preço ou segredo foi inventado. Não há implantação declarada como concluída.
