# Recriar Motion AI

Plataforma audiovisual em construção. Esta branch contém a fundação Next.js/Supabase, Motion Studio e um módulo Sound FX integrado à busca, pré-escuta por URL assinada, favoritos, administração de catálogo e edição de clipes de áudio na timeline. Recursos remotos exigem as migrations e credenciais Supabase; ainda **não** é um SaaS pronto para produção: render MP4 com mixagem, provedor de IA, Mercado Pago e sincronização OAuth com Google Drive permanecem pendentes.

## Requisitos

- Node.js 20+ e npm.
- Supabase para autenticação, Postgres e Storage.
- Worker Node em contêiner com Chromium/Playwright e FFmpeg para render MP4 com áudio; ainda não implementado/validado.
- Provedor de IA/Mercado Pago apenas quando essas fases forem iniciadas.

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`. Sem Supabase, o editor oferece modo local e exportação JSON; biblioteca Sound FX, upload, conta e sincronização remota não são simulados e ficam indisponíveis.

## Supabase

1. Crie projetos Supabase separados para desenvolvimento e produção.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A Service Role é somente de servidor, nunca `NEXT_PUBLIC_*`.
3. Aplique **as duas migrations** em ordem (`supabase/migrations/202611080001_initial_schema.sql` e `202611080002_sound_fx_library.sql`) e valide-as num Supabase de desenvolvimento antes de produção.
4. Configure `{APP_URL}/auth/callback`, email e URLs de recuperação.
5. A primeira migration cria o bucket privado `motion-media`; a integração Sound FX usa URLs temporárias de upload/reprodução emitidas apenas por rotas de servidor. Restrições de armazenamento e MIME devem ser revisadas no Dashboard.
6. Atribua papel `admin` por processo confiável; não aceite papel definido em metadata controlável pelo cliente. A administração fica em `/admin/sound-fx`.

### Sound FX

- O Studio abre a biblioteca pelo item **Sound FX Library**. Busca, categorias, duração, mood, favoritos, player e waveform usam dados reais do Supabase; sem migration/configuração, a interface informa a indisponibilidade em vez de mostrar sons falsos.
- Administradores podem importar lotes de MP3/WAV/OGG em `/admin/sound-fx`. Os arquivos vão diretamente do navegador ao bucket privado por signed upload; o servidor confere assinatura de arquivo, hash SHA-256, formato e duração. A waveform é extraída pelo decoder de áudio do navegador. Importação é desativada por padrão; a licença comercial e a permissão de redistribuição precisam ser revistas antes de publicar.
- Nomes de origem, titular, licença, autorização comercial/redistribuição, observações, categorias, tags, moods, favoritos globais e uso de espaço são administráveis. Favoritos pessoais são privados por usuário; “favorito global” é curadoria (`featured`). Assets usados em timelines são arquivados em vez de removidos; sem referências, podem ser excluídos junto com o objeto privado.
- A timeline oferece mover por arraste, duplicar, cortar no playhead, trim, duração, volume e fades, com playback alinhado ao playhead e URLs assinadas de 90 segundos. O renderizador MP4 original não está integrado a essa mixagem; não afirme áudio em exportação final até existir e passar um teste end-to-end de worker/FFmpeg.
- A pasta Google Drive indicada foi consultada: 29 metadados de arquivo, todos `audio/wav`, descritos em [`docs/soundfx-drive-inventory.md`](docs/soundfx-drive-inventory.md). Nenhum byte foi transferido ao Storage; durações/waveforms não foram verificados e nenhuma licença foi presumida. A aplicação ainda não tem OAuth Google Drive; importação é manual por upload autorizado depois de baixar os arquivos.

## Scripts

- `npm run dev` — servidor local em `0.0.0.0`.
- `npm run build` — build de produção.
- `npm run typecheck` — verificação TypeScript.
- `npm test` — testes unitários.
- `npm run lint` — lint.
- `npm audit` — auditoria de dependências.

## Deploy

Configure variáveis públicas/privadas separadamente na Vercel, Supabase e worker. Nunca comite `.env.local`, tokens de IA, Mercado Pago ou Service Role. Não envie renders longos para funções Vercel. Nenhum deploy foi feito/verificado nesta branch.
