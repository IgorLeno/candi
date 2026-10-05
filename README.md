# Candi — central do candidato

Painel local em Next.js e TypeScript que transforma uma planilha de busca de vagas em uma **fila de ação, KPIs e funil**, e que funciona como **central de operações** de bots de busca, análise, currículo e candidatura.

![Tela "Hoje": fila de candidaturas, meta semanal e alertas de qualidade dos dados](docs/screenshots/hoje-escuro.png)

> Todos os prints usam a fixture local (`lib/job-search/fixtures/snapshot.json`): empresas e vagas fictícias.

## O problema

Uma busca de vagas com automação gera muito estado espalhado: vagas analisadas, vereditos, dossiês, currículos gerados, candidaturas enviadas ou incertas, fontes que falharam. Esse estado mora em uma Google Sheet mantida por bots (repositório `job-search`), e a Sheet não responde às perguntas do dia a dia: _o que faço agora?_, _onde a busca está travando?_, _qual dado está inconsistente?_.

O Candi responde a essas perguntas sem virar uma segunda fonte de verdade:

- **Hoje**: próxima candidatura, fila de vagas abertas, meta semanal e alertas (envio incerto, dossiê inválido, divergência entre Sheet e dossiê).
- **Análise**: KPIs, funil da busca, evolução semanal, distribuições, cobertura de fontes e qualidade dos dados, com filtro de 30 ou 90 dias. Todo gráfico tem visão em tabela.
- **Vagas** e **Vaga**: lista com filtros na URL e detalhe por vaga em três seções (análise, currículo, candidatura).
- **Cotar vagas**: pede aos bots uma nova busca ou a análise de uma vaga específica e acompanha cada etapa até o registro na planilha.

## Arquitetura

```
           regras e enums                         estado operacional
   ┌──────────────────────────┐            ┌──────────────────────────┐
   │ job-search (Git)         │  escreve   │ Google Sheet de registro │
   │ bots: busca, análise,    │ ─────────▶ │ vagas, eventos, dossiês, │
   │ currículo, candidatura   │            │ cobertura de fontes      │
   └────────────▲─────────────┘            └────────────┬─────────────┘
                │ dispatch.py                           │ Sheets API
                │ argv fixo, env mínimo,                │ somente leitura
                │ texto livre só por stdin              │ (service account)
   ┌────────────┴───────────────────────────────────────▼─────────────┐
   │ Candi (Next.js 16, local)                                        │
   │ parsing por cabeçalho → validação zod + sha256 → JobView         │
   │ → métricas puras → páginas (Server Components)                   │
   │ Auth.js (Google, allowlist) em três portões                      │
   └──────────────────────────────────────────────────────────────────┘
```

O painel **nunca escreve na Sheet** e não tem credencial de escrita. Quando o usuário pede uma ação (registrar uma busca, descartar uma vaga), quem grava é o `job-search`, com a credencial dele e as validações dele.

## Destaques técnicos

Cada item aponta para onde está no código.

- **Sheet como fonte somente leitura, validada na entrada.** Parsing por nome de coluna, não por posição; enums espelham o contrato do `job-search` e valores fora do domínio são sinalizados, nunca corrigidos. O dossiê estruturado de cada vaga passa por schema zod e só é exibido se o `sha256` do JSON bater com o registrado (`lib/job-search/sheet-parse.ts`, `lib/job-search/dossier-schema.ts`, `lib/job-search/dossiers.ts`).
- **Métricas e funil como funções puras.** KPIs, funil, séries semanais e distribuições são calculados sobre `JobView` e testados em Vitest; a camada de apresentação só define rótulos, cores e ordem (`lib/job-search/metrics.ts`, `lib/job-search/present.ts`).
- **Orquestração de bots com superfície mínima.** O despacho roda `dispatch.py` do `job-search` com `execFile` (sem shell), argv fixo, env reduzido a uma lista explícita, timeout e saída JSON validada com zod; recusas viram mensagens claras na interface (`lib/ops/dispatcher.ts`, `lib/ops/schema.ts`, `lib/ops/present.ts`).
- **Texto livre só por stdin, com guardas dos dois lados.** As três entradas de texto do usuário (vaga indicada, orientação para um currículo travado, pedido de edição do currículo) passam por normalização NFKC, remoção de caracteres de controle, limite de 10 a 1500 caracteres e bloqueio de padrões de comando no painel, e de novo no dispatcher; nunca vão para a linha de comando (`lib/ops/intake.ts`).
- **Autenticação fail-closed em três portões.** Auth.js com Google e allowlist de um e-mail: o proxy barra páginas e `/api/*`, o layout do dashboard exige sessão, e a leitura da Sheet real recusa sem sessão permitida. Cada server action chama `getAllowedSession()` por conta própria (`auth.ts`, `proxy.ts`, `lib/auth/access.ts`, `app/actions/`).
- **Local-first.** Roda na máquina do dono com `pnpm build && pnpm start`; sem deploy, sem banco de dados, sem dependência de provedor de hospedagem.
- **Testes e CI.** Testes unitários em Vitest (parsing, schema, métricas, regras de apresentação, guardas de texto) e testes E2E em Playwright contra um **dispatcher falso** com a mesma CLI e o mesmo JSON do real, que avança uma etapa por consulta (`e2e/fixtures/job-search-fake`). O E2E não tem bypass de login: o servidor sobe com segredos descartáveis e os testes emitem o cookie de sessão. GitHub Actions roda lint, Prettier, testes com cobertura, E2E e build (`.github/workflows/ci.yml`).

## Telas

| Análise                                                       | Vagas                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| ![Análise: KPIs e funil](docs/screenshots/analise-escuro.png) | ![Vagas em cartões](docs/screenshots/vagas-escuro.png) |

| Vaga                                                                    | Cotar vagas                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ![Detalhe da vaga com dossiê íntegro](docs/screenshots/vaga-escuro.png) | ![Cotação acompanhada etapa a etapa](docs/screenshots/cotar-escuro.png) |

Tema claro:

![Tela "Hoje" no tema claro](docs/screenshots/hoje-claro.png)

## Como rodar

Requisitos: Node.js 20+ e pnpm.

```bash
pnpm install
cp .env.example .env.local   # JOB_SEARCH_DATA_SOURCE=fixture já é o padrão
pnpm dev                     # http://localhost:3000
```

Sem configurar a Sheet, o painel lê a fixture local. O login continua obrigatório: preencha em `.env.local` `ALLOWED_EMAIL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` e `AUTH_TRUST_HOST=true` (client OAuth do Google com redirect `http://localhost:3000/api/auth/callback/google`). Nunca commite credenciais.

Para ver tudo funcionando sem conta Google, rode a suíte E2E: ela sobe o servidor com a fixture, segredos descartáveis e o dispatcher falso.

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Com a Sheet real: `JOB_SEARCH_DATA_SOURCE=sheets`, `JOB_SEARCH_SHEET_ID` e `GOOGLE_SA_JSON_PATH` (service account somente leitura, fora do repositório). O despacho de bots fica desligado até `JOB_SEARCH_DISPATCH_ENABLED=true` e `JOB_SEARCH_REPO` apontando para o checkout do `job-search`.

### Qualidade

```bash
pnpm lint
pnpm format:check
pnpm exec tsc --noEmit   # o build não faz type-check
pnpm test                # Vitest
pnpm test:e2e            # Playwright (Chromium)
pnpm build
```

## Stack

Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind CSS 4, Radix UI (shadcn/ui), Recharts, zod, Auth.js v5, Google Sheets API, Vitest, Testing Library, Playwright, GitHub Actions.

## Documentação

Arquitetura e contrato com o `job-search`: [`docs/plans/2026-09-25-job-search-visual-layer.md`](docs/plans/2026-09-25-job-search-visual-layer.md). Central de operações: [`docs/plans/2026-09-29-ops-center-bot-triggers.md`](docs/plans/2026-09-29-ops-center-bot-triggers.md).
