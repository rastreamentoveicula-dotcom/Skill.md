# Testes e automação de qualidade

Este documento descreve a pirâmide de testes do projeto, como rodar cada camada,
as metas de cobertura e o que ainda falta cobrir.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm test` | Roda a suíte unitária/integração (Vitest) uma vez |
| `npm run test:watch` | Roda os testes em modo watch (desenvolvimento) |
| `npm run test:coverage` | Testes + relatório de cobertura (texto, HTML em `coverage/`, lcov) |
| `npm run test:ci` | Igual ao coverage, mas **falha** se as metas por módulo não forem atingidas |
| `npm run e2e` | Testes de navegador (Playwright: desktop + mobile) — requer `npx playwright install chromium` |
| `npm run smoke` | Smoke de produção: verifica os endpoints públicos do deploy (`SMOKE_BASE_URL` opcional) |
| `npm run ci` | Gate completo: typecheck + lint + testes (com metas) + build + auditoria de dependências |

## Pirâmide

### 1. Unitários e integração com mocks (`tests/`, Vitest)

92 testes em 14 arquivos, todos com o Supabase e os provedores de IA mockados
(nenhum segredo é necessário para rodar):

- `admin-ai-route` — `/api/admin/settings/ai`: autenticação, rate limit por
  bucket (12/h rede, 30/h mutação), ações test/save_activate/disable/delete/
  list_models, classificação de erros sanitizada (400/429/502/503/504) e
  contrato das mensagens em PT-BR.
- `agent-generate-route` — `/api/agent/generate`: limite de 20 chamadas de IA
  por hora por usuário, timeouts → 504, falhas de provedor → 502, contrato do
  campo `code` (`invalid_credentials`, `rate_limit`, `model_not_found`…).
- `ai-credentials-store` / `vault-store` — criptografia AES-256-GCM, envelopes
  RPC do Vault, classificação `VAULT_*`, códigos de banco traduzidos.
- `ai-provider-router` — enriquecimento de erros, mensagens PT-BR por código.
- `ai-providers` — adapters Gemini/OpenAI/Anthropic/OpenRouter.
- `projects-route` / `sound-effects-route` — validação zod, limites de corpo,
  filtros da biblioteca de sons (licença, favoritos, categorias).
- `admin-ai-panel` (jsdom + Testing Library) — o painel de `/admin/ai`:
  carregamento, estado de erro limpo (regressão do fix de "mensagem
  duplicada"), aviso de Vault não configurado, fluxo de salvar/ativar e
  mascaramento da chave.
- `read-json`, `project-validation`, `secret-vault`, `studio-ops`,
  `sound-effects`, `health-route` — utilitários e rota de saúde.

Estratégia de mocks: `server-only` vazio, `@/lib/supabase-server` /
`@/lib/supabase-admin` substituídos, e mocks parciais que preservam as classes
reais (`AIProviderError`) para que `instanceof` continue funcionando.

### 2. Cobertura com metas por módulo (v8)

O `npm run test:ci` **quebra** se a cobertura cair abaixo das metas em
`vitest.config.mts`:

| Módulo | Meta (lines) | Atual (lines) |
| --- | --- | --- |
| `app/api/admin/settings/ai/route.ts` | 85% | 90% |
| `app/api/agent/generate/route.ts` | 95% | 100% |
| `app/api/projects/route.ts` | 90% | 94% |
| `app/api/sound-effects/route.ts` | 90% | 94% |
| `lib/ai-credentials/**` | 75% | 81–100% |
| `lib/ai-provider-router.ts` | 90% | 100% |
| `lib/read-json.ts` | 70% | ~100% |
| `lib/secret-vault.ts` | 80% | 88% |
| Global | 34% | 35% |

Relatório HTML gerado em `coverage/index.html` (publicado como artefato no CI).

### 3. E2E de navegador (`e2e/`, Playwright)

Smoke de renderização **sem credenciais**, nos projetos `desktop` (Chrome) e
`mobile` (Pixel 7): a página inicial carrega, `/admin/ai` exige login e a API
responde 401 sem sessão. O job de e2e no CI instala o Chromium automaticamente
e é informativo (`continue-on-error`), para não travar merges por instabilidade
de browser.

Próximo passo natural: specs autenticados (login → Studio → Sound Library) com
uma conta de teste definida via secret do repositório.

### 4. Smoke de produção (`scripts/smoke-production.mjs`)

Roda contra o deploy público (`SMOKE_BASE_URL`, padrão
`https://motion-system-eta.vercel.app`) e verifica:

1. Página inicial responde (200);
2. `/api/health?fresh=1` → `{"status":"ok","db":"ok"}`;
3. `/api/admin/settings/ai`, `/api/projects`, `/api/sound-effects` → 401 sem
   sessão (parede de autenticação).

Sem segredos. Executado pelo job `smoke` do CI (push em `main` e
`workflow_dispatch`) e localmente com `npm run smoke`.

## CI (`.github/workflows/ci.yml`)

- **gate**: `npm ci` → typecheck → lint → testes com metas → build →
  `npm audit --audit-level=high`. Publica o relatório de coverage como artefato.
- **e2e**: build + Playwright (desktop + mobile). Informativo.
- **smoke**: verificação do deploy de produção.

Todo push e todo pull request passam pelo gate.

## O que ainda falta (auditoria de gaps)

O sistema tem as fundações prontas (projetos com cenas/personagens, editor de
timeline, biblioteca de sons com favoritos e IA com credenciais no Vault).
Continuam **sem automação de teste** e, em alguns casos, sem implementação:

1. **Galeria de templates prontos + "Modo simples" (RayMotion)** — trocar a
   tela de "Ferramentas" por uma galeria com preview; cada template vira um
   projeto com uma cena e um botão "Trocar tela" que reaproveita o
   `project-store`; ao avançar para o editor, as telas viram cenas.
2. **Render MP4 1080p no servidor** — `lib/audio-renderer.ts` está sem testes;
   falta o renderizador de vídeo propriamente dito.
3. **Editor avançado** — equiparar ao RayMotion (camadas, câmera, efeitos,
   vozes por trecho, upload de imagem, estilo por objeto/cena).
4. **Voz (TTS) e sincronização** — gerar locução por trecho de cena com o
   provedor de IA e sincronizar com a cena (fala → cards, como no "Voz mágica").
5. **Telas de Músicas e Locuções** — itens de navegação que ainda não existem.
6. **Rotações/música em segundo plano** — presets como "Giro" e opções de
   música de fundo na geração do vídeo.
7. **Planos e cobrança** — `/api/admin/settings/billing` (Mercado Pago) está
   sem testes e sem fluxo de assinatura.
8. **Google Drive** — não há integração para salvar/fazer backup dos projetos.
9. **Monitoramento** — sem Sentry/Logs; hoje só o smoke e o `/api/health`.
10. **E2E autenticado** — login → Studio → Sound Library → `/admin/ai`, com
    cobertura de fluxo real ponta a ponta (depende de conta de teste).
