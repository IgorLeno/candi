# estagios-dashboard → painel visual do job-search

## Contexto

`estagios-dashboard` (Next.js 16 + Supabase, checkout em `~/Projetos/estagios-dash/estagios-dashboard`) foi construído para _executar_ a busca: parse de vaga, fit, currículo, carta, PDF, perfil. Hoje ~68% do código de produção (≈21k de 30,6k LOC) é IA/PDF. Esse trabalho agora é feito melhor pelos Grok Bots do `job-search` (Job Scout → CV Strategist → CV Operator → Application Operator), com a Google Sheet como estado operacional e o Git como fonte de metodologia.

Objetivo: o dashboard vira a **camada visual e analítica, somente leitura**, do `job-search`. Bots fazem o trabalho; dashboard consolida e apresenta.

Decisões do usuário (2026-09-25):

- Dossiers chegam ao dashboard por **nova aba `Dossiers` na mesma Sheet**.
- **Sem banco**: dashboard lê a Sheet server-side com cache; Supabase sai.
- Vagas legadas do Supabase: **sem valor; descartadas sem export** (usuário, 2026-09-25). Supabase removido do projeto.
- Acesso: **login Google restrito ao email do usuário** (Auth.js).
- **Local-first** (usuário, 2026-09-25, revisão do WP6): o dashboard roda só na máquina do usuário (`pnpm build && pnpm start`, Auth.js + Google OAuth em `localhost`). Sem Vercel e sem Supabase; nenhum deploy de produção configurado. Menções a Vercel nos status dos WPs abaixo são históricas.

## Fontes de verdade (sem concorrência)

| Dado                                                     | Autoridade                                                                           | Dashboard                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Perfil, metodologia, enums, regras de interesse          | Git `job-search`                                                                     | espelha enums em código; nunca recalcula regra |
| Estado de vagas (23 colunas), eventos, cobertura         | Sheet (aba principal, `Eventos de Candidatura`, `Cobertura de Fontes`, `Encerradas`) | lê                                             |
| Análise estruturada da vaga                              | `dossier.json` (runtime do bot) → projeção na aba `Dossiers`                         | lê, valida, exibe                              |
| Estado fino da candidatura, respostas, CV, private store | runtime / private store                                                              | **nunca** acessa                               |
| Métricas agregadas                                       | derivadas em memória a cada leitura                                                  | não persiste                                   |

Regras invariantes:

- Nenhum deploy lendo a Sheet real antes de Auth (WP4).
- Dashboard **nunca escreve** na Sheet (credencial `spreadsheets.readonly`, service account própria, Viewer). Revisão
  2026-09-29 abaixo: ele pode pedir ao job-search que grave um writeset validado; quem escreve é o job-search.
- Nada de estado de vaga editável no dashboard. Correções vão pelo fluxo dos bots/coordenador.
- Revisão 2026-09-29 ([central de operações](2026-09-29-ops-center-bot-triggers.md)): o painel pode **pedir** aos bots que comecem trabalho (busca, currículo, candidatura) pelo `dispatch.py` do job-search. Continua sem escrever na Sheet, sem texto livre para bots e sem aprovar nada.
- Revisão 2026-09-29 (D3 revista): botão "Registrar na planilha" pede ao job-search (`dispatch.py persist`) que grave o
  writeset de uma busca com `writeset.py persist`, só depois de `writeset.py check` VALID e com a credencial de escrita
  **do job-search**. O painel continua sem credencial de escrita e nunca escreve na Sheet diretamente.
- Valor fora do domínio não quebra a UI: vai para bucket `INVÁLIDO` + painel de qualidade de dados (ex.: `NãO INICIADA`).
- Divergência Sheet × dossier (ex.: `interesse` ≠ `dossier.interest.level`) é sinalizada, não resolvida.

## O que fica, adapta, sai

**Mantém (visual):** `components/ui/*` (shadcn), `sidebar`, `theme-provider`, `star-rating` (se útil), `vagas-table` + `vaga-table-row` (filtros/expansão), `resumo-page` (recharts, base da visão geral), layout de Cards 1–2 de `app/vaga/[id]/page.tsx`, `lib/date-utils`, `lib/utils` (`getStatusBadgeClasses` adaptado aos novos enums), `modelo-layout.jpg` como referência de layout.

**Adapta:**

- `lib/types.ts`: `VagaEstagio` substituído pelo novo modelo (abaixo).
- `lib/supabase/queries.ts` → substituído por `lib/job-search/*` (mesma costura: funções que retornam listas tipadas).
- `vagas-table`: tira add/edit/delete; filtros pelos novos eixos.
- `/vaga/[id]` → `/vaga/[job_id]`: reescrito sobre o dossier.
- `configuracoes-page`: só tema.
- `ui/markdown-preview.tsx`: não escapa HTML (XSS). Posting é renderizado como texto puro; remover o renderer regex.

**Remove:**

- Todas as rotas `app/api/ai/*` (18), `api/pdf/generate`, `api/prompts`, `api/openrouter-key`, `api/resumes/*`, `api/vagas/*` (inclui PATCH sem validação), `api/candidate-profile`, `api/cron/cleanup-test-data`.
- `lib/ai/*`, `lib/security/*`, `lib/supabase/*`, `lib/model-attempt-tracker`, `lib/resume-tagline-preference`, `lib/utils/ai-mapper`, `lib/markdown-parser` (ingestão manual de .md substituída pelo dossier).
- Páginas `/perfil` (perfil em Supabase competia com `knowledge/` do job-search), `/test-ai`, `/admin/*` (template v0 `inscricoes`).
- Componentes de IA/CRUD/órfãos: add/edit-vaga dialogs, tabs de fit/currículo/descrição/parser, `resume-*`, cover-letter, configuracoes-prompts, system-prompts-viewer, `ai-settings/*`, meta-card + metas_diarias, dashboard-header de navegação diária, quick-fill-panel, file-upload/markdown-upload, curriculum-card, fit-card, registration-form, dashboard-content.
- Deps: puppeteer, puppeteer-core, @sparticuz/chromium, pdf-parse, redis, marked, turndown, @types/turndown, @supabase/\*.
- `vercel.json` (functions + cron), `supabase/`, `supabase-schema.sql`, `scripts/*.sql`, scripts Gemini/cleanup, testes de IA (~7,7k LOC) e e2e `ai-parser`/`resume-generator`.
- Branches locais stale (0 à frente de main) — só após confirmação.

## Novo modelo de dados (dashboard, `lib/job-search/`)

- `enums.ts` — domínios exatos espelhando `scripts/sheets_client.py` `ALLOWED_VALUES` e `scripts/classification.py` + rótulos PT legíveis e cores.
- `JobRow` — 23 colunas da aba principal localizadas **por cabeçalho**; enums tipados com fallback `{ invalid: raw }`; linhas sem `job_id` ignoradas; aceita cabeçalho legado `trilha`. Também lê `Encerradas` (flag `archived`).
- `ApplicationEvent` — `job_id, attempt_id, evento, timestamp, submit_mode, fingerprint8, evidencia`.
- `CoverageRow` — `data_execucao, fonte, tier, familia, resultado, observacoes`.
- `DossierRecord` — linha da aba `Dossiers` + `dossier` parseado por schema zod de `dossier/1` (espelho de `scripts/dossier.py`), `valid`, `integrity` (sha256 confere?).
- `JobView` (derivado) — `JobRow` + dossier mais recente + eventos ordenados + `analysis: FULL | PARTIAL | NONE | INVALID` (FULL = dossier válido e sha íntegro; PARTIAL = só colunas da Sheet classificadas, ou dossier válido com posting truncado/divergência Sheet×dossier; NONE = sem dossier, ex.: históricas `NAO_CLASSIFICADO`; INVALID = dossier presente mas sha/JSON/schema falha) + derivados: `actionable` (`status_disponibilidade == ABERTA`), `uncertainSubmit` (SUBMIT_INTENT sem resultado, regra de `registry.md`), `requirementsByEvidence` (ADERÊNCIA REAL / TRANSFERÍVEL / LACUNA / NÃO CONFIRMADO), `zona/uf/modalidade` do dossier, `issues[]`.
- `metrics.ts` — agregações puras sobre `JobView[]` (funil, distribuições, séries semanais por `data_primeira_analise` / `data_candidatura` / timestamps de eventos, cobertura por fonte).
- `sheets-reader.ts` (server-only) — `values:batchGet` Sheets API v4 com JWT da service account read-only; env `JOB_SEARCH_SHEET_ID`, `GOOGLE_SA_JSON_B64`. Cache `unstable_cache` revalidate 300s + tag; botão "Sincronizar" → server action `revalidateTag`. Modo `JOB_SEARCH_DATA_SOURCE=fixture` lê JSON local (dev/testes/e2e).

## Contrato novo no job-search: aba `Dossiers`

Transporte determinístico, mesmo padrão estruturado do `REGISTRY_WRITESET`; nenhuma etapa depende de copiar/colar JSON livre de resposta de bot.

- `scripts/dossier.py export <dir>` (executado pelo Job Scout após `build` VALID) gera a linha de transporte: JSON canônico (`sort_keys`, separadores fixos, UTF-8) → `dossier_sha256`; payload codificado em base64 (seguro para tabela markdown, sem `|`/quebras); `posting_md` idem, truncado com flag para caber em 50k chars/célula.
- A linha entra como seção `## DOSSIER_ROWS` **dentro** do `REGISTRY_WRITESET` (mesmo bloco, mesmo `WRITESET_COMPLETE`), nunca como texto redigido pelo bot.
- Parser/validador executável (`scripts/writeset.py`, a definir no WP1) decodifica, recalcula sha, valida `dossier/1` e produz as linhas exatas da aba; persistência só grava o que o parser aprova, depois relê e compara sha.
- Headers e schema exatos da aba (proposta inicial: `job_id`, `captured_at`, `schema`, `posting_sha256`, `dossier_sha256`, `dossier_json`, `posting_md`, `posting_truncated`) **fechados no WP1 antes** de qualquer criação da aba. Aba só é criada depois do contrato aprovado.
- Append idempotente por `(job_id, posting_sha256)`; dashboard usa `captured_at` mais recente por `job_id` e recalcula `dossier_sha256`.
- Dossier já não contém PII (validador rejeita); `posting_md` é contexto, exibido escapado.
- Atualizar: `methodology/registry.md`, `methodology/reports.md`, `methodology/dossier.md`, `scripts/sheets_client.py` (headers), `scripts/dossier.py` (export), parser do writeset, `scripts/validate_job_search.py`, testes; `methodology/sheets-service-account.md` documenta a SA read-only do dashboard. Bot clone sincroniza via `grok-bot/SYNC.md`.

## Telas

1. **Visão geral `/`** — KPIs (analisadas, selecionadas, abertas acionáveis, em preparação, prontas p/ revisão, enviadas); alerta vermelho para `ENVIO INCERTO`; funil analisadas→selecionadas→abertas→em preparação→enviadas; séries semanais (análises, candidaturas); distribuições por `familia_funcao`, `setor`, `interesse`, `proximidade_eq`, `tipo_programa`, `fonte_descoberta`, `portal_candidatura`, zona/UF, modalidade; cobertura de fontes (resultado por fonte ao longo do tempo); painel de qualidade de dados (enums inválidos, `NAO_CLASSIFICADO`, SELECIONADA sem dossier, divergências). Filtro de período global.
2. **Vagas `/vagas`** — tabela com busca, filtros por todos os eixos, ordenação por interesse/data; linha expandida com frase-núcleo e badges.
3. **Vaga `/vaga/[job_id]`** — cabeçalho (empresa, cargo, links vaga/candidatura, badges de status); Resumo (frase-núcleo, senioridade, `status_analise`, `gate_decisivo`, `motivo_analise`); Atividades (centralidade); Requisitos (tabela tipo × evidência) + colunas Aderências reais / transferíveis / Lacunas; Classificação e Interesse (nível + amplificadores, negativos, compensações explicados); Riscos de representação (status, consequencial); Localização e jornada; Candidatura (status + linha do tempo de eventos); Publicação original (colapsável, texto puro); observações da Sheet.

Gráficos: recharts existente; carregar skill `dataviz` antes de escrever gráficos.

## Work units (uma preocupação por branch)

Os status de cada WP são o registro do momento em que foram escritos ("não publicada", "PR ainda não aberto" etc.). Todas as branches dos WP0–WP6 já foram mergeadas em `main` e apagadas; o estado atual está no fechamento do WP6.

- [x] **WP0 Baseline** — plano salvo em `docs/plans/`; tag local `legacy-final` → `4f1d813`; diff de `components/ui/*` diagnosticado (troca `transition-[…]` → `transition-all`, sem decisão). Export Supabase cancelado: usuário confirmou que não há dado útil (host já não resolvia DNS).
- [x] **WP1 job-search: aba Dossiers** (repo job-search, PR próprio) — contrato exato de headers/schema + `dossier.py export` + parser do writeset + testes + validador + doc SA read-only. Criação da aba e da SA só depois do contrato fechado.
  - Status (2026-09-25): **contrato aprovado pelo usuário** (incl. chave `(job_id, dossier_sha256)` e posting completo no transporte). `job-search` branch `feat/dossier-export-contract` (5 commits) publicada em `github`, PR ainda não aberto. `dossier_json` acima de 45.000 unidades UTF-16 é rejeitado com `DOSSIER_CELL_TOO_LARGE` (export e writeset). SA read-only `job-search-dashboard-reader@job-search-registry.iam.gserviceaccount.com` criada pelo usuário, Viewer na Sheet; JSON local em `~/.config/estagios-dashboard/google-sa.json` (uso só no WP3). Aba `Dossiers` ainda não criada.
  - Contrato: aba `Dossiers` = `job_id | captured_at | schema | posting_sha256 | dossier_sha256 | dossier_json | posting_md | posting_truncated`; Sheet guarda JSON canônico e posting **decodificados** (base64 só no transporte); escrita RAW; chave de append `(job_id, dossier_sha256)` (não `posting_sha256`: reanálise do mesmo posting não é descartada); leitor usa maior `captured_at` (empate: linha mais abaixo) e recalcula sha sobre o texto da célula; `posting_md` truncado a 45.000 unidades UTF-16 com `posting_truncated = TRUE/FALSE`.
  - Transporte `## DOSSIER_ROWS` = `job_id | captured_at | schema | posting_sha256 | dossier_sha256 | posting_truncated | dossier_json_b64 | posting_md_b64` (posting **completo** em base64, para o parser revalidar hash e citações); parser `scripts/writeset.py check|rows`.
- [x] **WP2 Remoção de IA/automação** — itens "Remove" acima; app fica com shell visual e dados fixture vazios; build verde.
  - Status (2026-09-25): branch `chore/remove-ai-automation` (empilhada sobre a branch do plano), não publicada. Removidos rotas/libs/páginas/componentes de IA, PDF, Supabase e CRUD, `middleware.ts`, deps, `vercel.json`, `supabase/`, `scripts/`, testes de IA e e2e dependentes de Supabase; docs de diretório obsoletos. Posting/observações renderizados como texto puro (`markdown-preview` removido). `lib/types.ts` reduzido a `VagaEstagio`/`HistoricoResumo` interinos. Branches locais stale **não** apagadas (aguarda confirmação).
  - Verificado: `pnpm lint` (0 erros), `pnpm format:check`, `tsc --noEmit` limpo, `pnpm test` (42/42), `pnpm build`; shell navegado via `next start` no browser pane (abas, `?tab=`, `/vaga/inexistente`). `pnpm test:e2e` 3/3 contra `next start` (Chromium do Playwright instalado depois; `pnpm dev` com Turbopack falha por limite de arquivos da máquina — `Too many open files` —, então e2e local roda com `pnpm build && pnpm start`). Smoke e2e corrigido (locator ambíguo em strict mode). Nota: `next.config.mjs` tem `ignoreBuildErrors`, então `pnpm build` não faz type-check.
- [x] **WP3 Camada de dados** — sem auth só com fixtures em dev; nenhuma versão lendo a Sheet real é publicada antes do WP4 — `lib/job-search/*` + fixtures portadas de `job-search/scripts/testing_fixtures.py` (`fake-1001`) + testes unitários (parse por cabeçalho, enum inválido, `trilha` legado, SUBMIT_INTENT órfão, sha mismatch, métricas).
  - Status (2026-09-25): branch `feat/job-search-data-layer` (empilhada sobre WP2), não publicada. `lib/job-search/`: `enums`, `dossier-schema` (zod `dossier/1`, estrutural; não recalcula regras), `sheet-parse` (cabeçalho, `trilha` legado, `{ invalid }`), `dossiers` (sha256 do texto da célula, cross-check de colunas, maior `captured_at`/empate linha mais abaixo), `build` (`JobView`), `metrics`, `sheets-api` (JWT da SA via `node:crypto`, só GET, erros só com código), `source` (`server-only`, `unstable_cache` 300s + tag `job-search`). Fixture gerada por `scripts/generate-job-search-fixture.py` a partir do código do job-search (round-trip `transport_row` → `decode_dossier_row` → zod). Fonte padrão = fixture; Sheet real só com `JOB_SEARCH_DATA_SOURCE=sheets` e recusada em Vercel (`SHEETS_DISABLED_UNTIL_AUTH`) até o WP4. Credencial: `GOOGLE_SA_JSON_B64` (deploy) ou `GOOGLE_SA_JSON_PATH` fora do repo (dev; `.env.local` configurado). Botão "Sincronizar" (server action `revalidateTag`) fica para o WP5, junto da UI.
  - Verificado: 94 testes Vitest (inclui mutação do desempate detectada), `tsc`, lint, format, build. Leitura real com a SA (só contagens): aba principal `Vagas` com 45 linhas com `job_id`, 14 SELECIONADA e 8 ENVIADA — iguais à contagem bruta independente; 4 em `Encerradas`; aba `Dossiers` já existe (só cabeçalho). Escrita (`batchUpdate` no-op) negada com HTTP 403 `PERMISSION_DENIED` tanto com token `spreadsheets.readonly` quanto com escopo `spreadsheets` (confirma papel Viewer). Achados da Sheet real: `Encerradas` ainda com cabeçalho pré-v1 (`trilha`, sem `tipo_programa`/`proximidade_eq`/`setor`/`interesse`/`application_model`); 4 linhas com enum fora do domínio; 45 `NAO_CLASSIFICADO`. `pnpm test:e2e` 3/3 após rebase. Não verificado: `source.ts` dentro do runtime Next (ainda sem consumidor; entra no WP5).
- [x] **WP4 Auth** — Auth.js Google, allowlist `ALLOWED_EMAIL`, middleware cobre tudo.
  - Status (2026-09-25): branch `feat/google-auth` (empilhada sobre WP3), não publicada. `next-auth@5.0.0-beta.32` (peer aceita Next 16). Next 16 renomeou `middleware.ts` → `proxy.ts` (runtime Node). `auth.ts`: Google, sessão JWT 7 dias, `signIn` exige `email_verified` + email = `ALLOWED_EMAIL`; `authorized` reavalia o email da sessão a cada request (trocar `ALLOWED_EMAIL` revoga sessões). Regras puras em `lib/auth/access.ts` (fail closed com allowlist vazia). Três camadas: `proxy.ts` (tudo exceto assets de build e arquivos de `public/`; páginas → `/login`, `/api/*` → 401), `app/(dashboard)/layout.tsx` (`requireAllowedSession`), `getJobSearchData()` recusa `sheets` sem sessão (`UNAUTHENTICATED`) fora do cache. `/login` com erros `AccessDenied`/`Configuration`; botão "Sair" na sidebar. Guarda `SHEETS_DISABLED_UNTIL_AUTH` removida depois do login Google real verificado: a Sheet real passa a exigir só sessão autorizada, em qualquer host.
  - E2E sem Google e sem bypass no app: servidor de teste roda com `AUTH_SECRET` descartável (`e2e/auth.ts`, `webServer.env`) e os testes forjam o cookie JWE com esse segredo; um deploy com segredo próprio rejeita esses cookies.
  - Verificado: 107 testes Vitest (allowlist, `email_verified`, caminhos públicos, 401 em API, revogação por `ALLOWED_EMAIL`, `sheets` sem sessão não faz fetch), `tsc`, lint, format, build (`ƒ Proxy`). `pnpm test:e2e` 9/9 contra `next start` (anônimo → `/login?callbackUrl`, API 401 JSON, email fora da allowlist recusado, cookie com outro segredo recusado, erro `AccessDenied`, sessão autorizada entra e "Sair" encerra). Botão Google gera redirect OAuth correto (interceptado antes de sair: `redirect_uri=/api/auth/callback/google`, `openid profile email`, PKCE S256 + state). Login Google real (client OAuth e `AUTH_SECRET` reais no `.env.local`, `next start` local): credenciais aceitas pelo Google (sem `invalid_client`/`redirect_uri_mismatch`); o usuário entrou com o email da allowlist e voltou ao dashboard, e outra conta Google foi recusada com a mensagem `AccessDenied` (resultado relatado pelo usuário: o login foi feito por ele no browser pane). **Não verificado:** fluxo no Vercel (redirect URI de produção e env vars do Vercel ainda não configurados); leitura da Sheet real com sessão no runtime Next (sem consumidor até o WP5).
- [x] **WP5 UI** — telas 1–3 sobre `JobView`.
  - Status (2026-09-25): branch `feat/dashboard-ui` (empilhada sobre `feat/google-auth`), não publicada. Rotas `/` (visão geral), `/vagas` (lista), `/vaga/[job_id]` (vaga) e `/configuracoes` (tema), todas em `app/(dashboard)/`, com sidebar por rotas (barra superior abaixo de `lg`). Shell WP2 removido (`VagaEstagio`, `vagas-table`, `vaga-table-row`, `resumo-page`, `star-rating`, abas `?tab=`). `lib/job-search/present.ts`: projeção enxuta para a lista (sem posting/dossier), filtros em URL, tons de status, grupos de atenção, período; rótulos PT de fatores/riscos/eventos em `enums.ts` (só exibição). Visão geral: alerta vermelho ENVIO INCERTO, KPIs clicáveis, funil, série semanal (recharts, 2 séries, paleta dataviz validada, tabela alternativa), 13 distribuições com link para a lista filtrada, cobertura por fonte com últimas execuções, painel de qualidade (FULL/PARTIAL/NONE/INVALID, problemas por código, estrutura da Sheet); filtro de período (tudo/90/30 dias) por `data_primeira_analise`. Lista: busca sem acento, 13 facetas (domínio do contrato + valores presentes, inclui INVÁLIDO), envio incerto, problema de dados, ativas/encerradas, ordenação. Vaga: badges, links só `http(s)`, banner da análise (motivos de INVALID recolhidos, tabela de divergências, problemas), resumo, atividades, requisitos em aderência real/transferível/lacunas, interesse com amplificadores/fracos/negativos/compensações, riscos, localização e jornada, candidatura com linha do tempo por tentativa, publicação recolhida em texto puro (oculta se INVALID). "Sincronizar" = server action com `getAllowedSession()` + `updateTag`. Fixture não precisou ser estendida.
  - Achado corrigido: prefetch dos `<Link>` (proxy renova o cookie de sessão em cada request) ressuscitava a sessão logo após "Sair"; links de dados e sidebar usam `prefetch={false}`. Risco residual (qualquer request em voo durante o logout) corrigido depois: o `proxy.ts` não regrava mais o cookie de sessão (e2e "resposta lenta com o cookie antigo não reativa a sessão após Sair").
  - Verificado: `pnpm lint` (0 erros, 2 avisos pré-existentes), `format:check`, `tsc --noEmit`, `pnpm test` 122/122 (novos testes de `present.ts`), `pnpm build`, `pnpm test:e2e` 14/14 contra `next start` com `E2E_AUTH_ENV` (visão geral → lista → vaga, KPI/distribuição → lista filtrada, filtros/busca/URL, alerta ENVIO INCERTO, dossier inválido sem conteúdo, enum inválido, vaga sem dossier, vaga inexistente). Logout estressado 24/24. Layout conferido por screenshots Playwright em 1280px e 390px, claro e escuro. **Não verificado:** leitura da Sheet real no runtime Next com sessão (não executada nesta etapa), botão "Sincronizar" contra a Sheet real, Vercel.
- [x] **WP6 Local-first: sair de Vercel e Supabase** — escopo revisto pelo usuário (2026-09-25): em vez de limpar env vars no Vercel, o repositório deixa de depender de Vercel e Supabase. Exclusão dos projetos externos (Vercel, Supabase) feita pelo usuário com autorização separada (ver fechamento).
  - Status (2026-09-25): branch `chore/local-first-dashboard` (PR #11). Removidos `@vercel/analytics` (import, `<Analytics />`, dep, lockfile) e o `VERCEL=1` residual de `source.test.ts`. Nenhuma dependência Supabase ativa. Docs atuais descrevem o modo local-first; docs legados que parecem guias operacionais ganharam aviso de histórico.
  - Verificado: `pnpm lint` (0 erros, 2 avisos pré-existentes), `format:check`, `tsc --noEmit`, `pnpm test` 124/124, `pnpm build`, `pnpm test:e2e` 16/16 contra `next start`; smoke no browser (fixture): `/`, `/vagas`, `/configuracoes` com sessão, "Sair" volta a `/login`, só requests para `localhost:3000`. Sheet real lida localmente com a SA read-only (aba `Vagas`, 49 vagas). Arquitetura final validada com login Google real em `next start` local e `JOB_SEARCH_DATA_SOURCE=sheets`: anônimo → `/login`; login com o email permitido; `/`, `/vagas` (49 de 49) e uma vaga abrem com a Sheet real; contagens batem com leitura independente da API (`Vagas` 45 + `Encerradas` 4; SELECIONADA 18; ENVIADA 9; EM PREPARAÇÃO 2; `Dossiers` vazia → 49 sem análise); browser só fez requests para `localhost:3000`; build sem referência a Supabase/Vercel; "Sincronizar" só renovou o snapshot (horário de leitura mudou, contagens iguais; action = sessão + `updateTag`, API do Sheets só com GET); "Sair" volta a `/login` e rota protegida redireciona. Env vars Supabase removidas de `.env.local`/`.env.test`; worktree antigo removido (`git worktree remove`). Gates crus verdes (lint 0 erros, format, tsc, 124/124, build, e2e 16/16). **Não verificado:** conexões de saída do servidor capturadas em rede (só código, build e browser).
  - Fechamento (2026-09-25): PR #11 mergeado em `main` (`af25ff1`); CI pós-merge em `main` verde (run 36161825593). Validado com login Google real em `next start` local: leitura da Sheet real no runtime Next, "Sincronizar" só renova o cache (read-only) e "Sair" real encerra a sessão. Dependências Vercel/Supabase removidas do código. Projeto Vercel excluído (API do Vercel responde "Project not found"); integração Vercel removida deste repositório (relato do usuário; o repositório não tem webhooks); Vercel CLI local deslogado. Projeto Supabase excluído (relato do usuário; o host do projeto não resolve mais DNS). Env vars legadas removidas de `.env.local`. Branches locais mergeadas e worktree antigo removidos. Preservados: client OAuth Google, projeto Google Cloud, service account read-only e a Sheet.

## Verificação

- Dashboard: `pnpm lint`, `pnpm format:check`, `pnpm build` (tsc), `pnpm test` (vitest: data layer + métricas), `pnpm test:e2e` em modo fixture (navegação overview → lista → vaga, filtros, alerta ENVIO INCERTO, dossier inválido, enum inválido). `grep` final sem `openrouter|puppeteer|supabase|lib/ai`.
- job-search: `python3 scripts/validate_job_search.py`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, `git diff --check`; round-trip `dossier.py build` → `export` → parse no zod do dashboard com a mesma fixture.
- Real: com SA read-only, rodar `pnpm dev` e conferir contagens contra a Sheet (total de linhas com `job_id`, nº SELECIONADA, nº ENVIADA); confirmar que SA não consegue escrever (tentativa de write retorna 403); abrir via browser pane e validar layout mobile/desktop, tema claro/escuro.

## Riscos

- Coordenador (ChatGPT) copiando JSON grande pode corromper → `dossier_sha256` detecta; dashboard mostra "dossier ilegível" sem quebrar.
- Limite de 50k chars/célula → truncamento de `posting_md` com flag; dossier cabe com folga.
- Drift de enums entre repos → testes do dashboard fixam domínios; divergência com `Valores Permitidos` lida em runtime aparece no painel de qualidade.
- Dados ainda rasos: runtime local vazio; vagas históricas `NAO_CLASSIFICADO` sem dossier → UI precisa estados vazios decentes.
