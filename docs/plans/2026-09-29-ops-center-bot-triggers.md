# Central de operações: disparar bots pelo painel (2026-09-29)

Status: **implementado (2026-09-29), incluindo "Registrar na planilha" (D3 revista); falta a validação real com os
bots** (itens abaixo). Commits direto na `main` dos
dois repositórios (projeto solo, sem branches novas, por decisão do dono).

Objetivo: o painel deixa de ser só leitura e passa a **pedir trabalho** aos bots do `job-search`:

1. `/vaga/[job_id]`: "Gerar currículo" → CVerino ("Severino") + Curriculinho, antes da candidatura.
2. `/vaga/[job_id]`: "Preencher candidatura" → Candidatinho, de preferência com o currículo já pronto.
3. `/` e `/vagas`: "Buscar vagas" → Lince (busca ampla + prefilter) → Service Threadgist (ChatGPT) →
   writeset → "Registrar na planilha" (job-search grava; ou o coordenador) → "Sincronizar".

## Decisões do dono (2026-09-29)

- **D1 Canal**: seletor Hermes | Grok no painel (créditos variam entre as plataformas). Hermes é disparado
  pelo dispatcher; o Grok não tem canal programático (ver Achados), então no modo Grok o painel gera o
  comando fixo para colar no Grok Bot e registra o disparo como manual.
- **D2**: "Severino" = CVerino (`jobsearchcverino`). Botão "Gerar currículo" por vaga aciona CVerino, que
  passa o `PATCH_READY` ao Curriculinho; o Curriculinho, aberto no MASTER no Claude Design, duplica, edita a
  cópia e exporta `cv.pdf`/`cv.json`. Quando o currículo estiver pronto (`cv_export.py verify` = `VALID`),
  o painel sinaliza e o "Preencher candidatura" avisa o Candidatinho que o CV já existe.
- **D3** (original): a persistência continua com o coordenador; o painel só mostra "writeset pendente" e detecta o
  registro pela Sheet depois de "Sincronizar". A análise passa obrigatoriamente pelo ChatGPT (Threadgist).
- **D3 revista (2026-09-29, dono)**: botão "Registrar na planilha" no card da busca. O painel pede ao job-search
  (`dispatch.py persist <id da busca>`) que rode `scripts/writeset.py persist` no writeset da busca, só depois de
  `writeset.py check` VALID e com a credencial de escrita **do job-search**. O painel continua sem credencial de
  escrita e nunca escreve na Sheet diretamente; o coordenador também pode persistir. A análise continua
  obrigatoriamente pelo ChatGPT (Lince → Threadgist → ChatGPT).
- **D4**: o registro do disparo guarda só estado e marcador, sem o texto da resposta.
- **D5**: teto de gasto padrão de US$ 2 por perfil para os testes.
- Indicador de progresso em porcentagem por etapa (busca, análise, writeset, registro; CVerino,
  Curriculinho, CV registrado; claim, preenchimento, revisão, aguardando aprovação).
- Risco do Candidatinho corrigido: comandos do painel levam a marca `[painel:dispatch …]`, texto fixo sem
  campo livre, recusa de qualquer padrão de aprovação, e a regra "comando do painel não é aprovação" entra
  no papel canônico do Candidatinho.

## Implementação (substitui os WPs originais)

- [x] job-search: `hermes/browsers/dispatch.py` (start/list/ack, entrega pelo `/api/ws` com o processo
      conectado até o fim do trabalho, progresso por artefatos) + testes + `RUNTIME.md`
- [x] job-search: marca do painel no papel do Candidatinho (`deploy_bots.py`,
      `methodology/application-operator.md`); teto padrão US$ 2 em `serve.sh`
- [x] painel: `lib/ops/*` (execFile, zod, flag), `app/actions/ops.ts` (sessão em toda action)
- [x] painel: botões, diálogo com seletor Hermes/Grok, barra de progresso, polling
- [x] testes (Vitest + E2E com dispatcher falso) e quality gates; docs
- [x] "Registrar na planilha" (D3 revista): job-search `dispatch.py persist` + testes + `RUNTIME.md` e
      `methodology/registry.md`; painel `registerWriteset`, botão e diálogo no card da busca, sincronização ao
      concluir; dispatcher falso de E2E com o mesmo contrato; testes e quality gates; docs
- [ ] Validação real (dono): reiniciar o gateway com teto US$ 2, `deploy_bots.py` com o gateway parado, ligar
      `JOB_SEARCH_DISPATCH_ENABLED` no `.env.local` e disparar uma vez cada ação
- [ ] Validação real do registro (dono): um writeset real indicado pelo dono, "Registrar na planilha" uma vez,
      conferir contagens no card e na Sheet

### Resultado (2026-09-29)

- job-search `e580d3a`: `dispatch.py` + `test_dispatch.py` (17 testes, probe e WebSocket falsos; passam com o
  Python do sistema e com o do runtime), regra "comando do painel não é aprovação", teto padrão US$ 2 em
  `serve.sh`, seção em `RUNTIME.md`. `validate_job_search.py` OK, 520 testes de `scripts/` OK,
  `git diff --check` limpo. `dispatch.py list` real (só leitura) conferido: gateway `running`, vaga 4466682591
  com dossier VALID e CV ausente.
- Painel: `lib/ops/*`, `app/actions/ops.ts`, `components/job-search/ops.tsx`; botão "Nova busca" em Hoje e
  /vagas, "Gerar currículo" e "Preencher candidatura" no cabeçalho da vaga, diálogo com seletor Hermes/Grok,
  barra de progresso por etapa com polling de 5 s enquanto roda. Gates: lint (0 erros, 2 avisos antigos),
  prettier, `tsc --noEmit`, Vitest 150/150 (15 novos), `next build`, Playwright 21/21 (4 novos) num
  `next start` na porta 3010 com dispatcher falso (a 3000 está com a instância do dono). Screenshots
  conferidos: Hoje escuro 1280px e vaga clara 390px.
- **Não verificado**: disparo real contra o gateway (nenhum bot foi acionado nesta sessão; o pipeline do Lince
  estava parado em `HUMAN_CONTROL_PAUSED` e reiniciar o gateway o interromperia); comportamento com o Bot Chat
  aberto no Desktop (`SESSION_NOT_OWNED` é tratado, mas não observado); modo Grok além de gerar o comando.
- **Registrar na planilha (D3 revista)**. job-search `20277a8`: `dispatch.py persist <id da busca> [--again]`
  recusa id inválido, busca inexistente/ativa/sem `op_dir`, writeset sem `check` VALID, outra gravação ativa (uma por
  vez) e writeset igual (sha256) já gravado. Filho desanexado `_persist` (mesmo Python do disparo, que tem
  `google-auth`) confere o sha de novo e roda `writeset.py persist` com timeout de 300 s; o registro
  `REGISTRAR_WRITESET` (plataforma `host`) guarda só estado, código (`SHEET_<erro>`, `WRITESET_INVALID`,
  `WRITESET_CHANGED`, `PERSIST_TIMEOUT` → `INCERTO`) e contagens. Assíncrono porque o persist faz ~4 chamadas à API
  por vaga e passaria do timeout de 30 s do `execFile` do painel; repetir após falha é seguro (UPSERT e append
  idempotentes), então `INCERTO` não bloqueia. A etapa "Registro na planilha" da busca fica `done` com a gravação
  concluída do writeset atual. `test_dispatch.py` 21 testes (4 novos, persist falso), `validate_job_search.py` OK, 520
  testes de `scripts/` OK, `git diff --check` limpo. Painel: `registerWriteset` (sessão antes de tudo, id por regex,
  argv `["persist", id]`), botão e diálogo ("o job-search vai gravar N vagas… credencial de escrita dele"), polling
  enquanto a gravação roda e `syncJobSearch` + `router.refresh()` quando ela conclui. Gates: lint (0 erros, 2 avisos
  antigos), prettier, `tsc --noEmit`, Vitest 154/154, `next build` (numa cópia no scratchpad, para não trocar o
  `.next` da instância do dono na 3000), Playwright 21/21 na 3010 com o dispatcher falso; screenshots do card
  pendente, do diálogo e do card registrado conferidos. **Não verificado**: `writeset.py persist` contra a Sheet
  real (nenhum teste grava a Sheet; execução real só com writeset indicado pelo dono) e o filho `_persist` real
  (testado com runner falso; o spawn usa o mesmo caminho do `_deliver`).
- Gateway em execução usa `JSB_BUDGET_USD=0.50` e ledger `real-20260929`; o padrão novo (US$ 2) só vale no
  próximo `serve.sh start`. A unit systemd fixa `JSB_GATEWAY_BUDGET=5` (não alterada).

## Achados (com evidência)

Todos os caminhos abaixo são do repositório `job-search` (`main`, `a614087`), salvo indicação.

### Quem é quem

| Nome do usuário | Papel canônico                                    | Perfil Hermes           | Evidência                                                                                                |
| --------------- | ------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Candidatinho    | Application Operator                              | `jobsearchcandidatinho` | `hermes/browsers/deploy_bots.py` (`ROLE_FLOW`), `browsers.sh` ("Browser D — Candidatinho e Cadastrinho") |
| Severino        | CV Strategist (o repositório escreve **CVerino**) | `jobsearchcverino`      | `deploy_bots.py`, `README.md` ("CV Strategist / CVerino")                                                |
| Curriculinho    | CV Operator                                       | `jobsearchcurriculinho` | `deploy_bots.py`, `clouddesign-browser.desktop`                                                          |
| Bot de busca    | Job Scout, no Hermes chamado **Lince**            | `jobsearchportal`       | `deploy_bots.py` (`"Você é o Lince, Job Search Operator"`), `RUNTIME.md`                                 |
| (ponte ChatGPT) | Service Threadgist                                | `jobsearchthreadgist`   | `THREADGIST_ROLE.md`                                                                                     |

"Severino" não aparece no repositório; o dono confirmou que é o CVerino (2026-09-29).

### Como os bots são acionados hoje

- **Hermes (caminho operacional atual).** Gateway dedicado `safe_hermes.py serve --isolated` em
  `127.0.0.1:9239` (`hermes/browsers/serve.sh`, unit `job-search-hermes-gateway.service`), dono dos seis
  perfis (`.jsb-owner.lock`). Ele está escutando nesta máquina agora. O Hermes Desktop fala com ele como
  "Remote gateway" com token de sessão em `~/.local/share/job-search/hermes/home/.jsb-gateway-token`
  (`RUNTIME.md`). O protocolo é JSON-RPC em `ws://127.0.0.1:9239/api/ws?token=…`:
  `session.list {profile, title:"Bot Chat"}` → `session.resume` ou `session.create` →
  `prompt.submit {session_id, text}` → eventos `message.complete` (cliente de referência em
  `hermes/browsers/test_agent_messages.py`, `_bot_chat`).
- `message_agent` (Bot ↔ Bot) **só existe no Bot Chat** (`agent_messages.py`, recusa `NOT_BOT_CHAT`), com
  rotas fixas em `runtime_policy.json`: Candidatinho → CVerino/Curriculinho/Threadgist/Cadastrinho;
  CVerino → Threadgist/Curriculinho/Candidatinho; Lince → Threadgist. Um turno humano abre workflow novo.
  Logo, o disparo precisa cair **no Bot Chat** do bot certo, senão ele não consegue chamar os outros.
- `hermes/browsers/run.sh` e `hermes/job-scout/run.sh` (CLI) **não servem com o gateway de pé**: `run.sh`
  sai com código 95 se o gateway é dono do perfil (`RUNTIME.md` § Ownership). `hermes/job-scout/run.sh` usa
  ainda o perfil antigo `jobsearch` em `~/.hermes`.
- **Grok Bot.** Os papéis em `grok-bot/*` rodam no computador cloud do Grok (clone `/workspace/job-search`,
  `grok-bot/SYNC.md`) e são iniciados colando prompts no chat (`BOOTSTRAP_PROMPT.md`). O repositório não
  documenta nenhuma API, fila ou CLI de entrada para eles. O app local (`~/.grokbot`, `~/.config/Grok Bot`)
  só tem arquivos de conexão de um "local-exec daemon" (li apenas nomes, não conteúdo). **Não há canal
  programático documentado para o Grok**; usá-lo exigiria engenharia reversa de um app de terceiros.

### Fatos que mudam o pedido

- **Busca não grava a Sheet sozinha.** O Job Scout entrega um `REGISTRY_WRITESET`; quem grava é o
  coordenador (`scripts/writeset.py persist`, com a credencial de escrita do job-search), depois de auditar
  (`methodology/registry.md` §§ 10–15, 110–112; `grok-bot/OPERATIONAL_SKILL.md`). Até isso, o writeset está
  "PENDENTE DE PERSISTÊNCIA". Portanto "Buscar → Sincronizar → aparece em /vagas" só funciona se alguém
  persistir o writeset no meio.
- **Candidatinho já chama CVerino e Curriculinho** quando a vaga tem perguntas ou anexa CV
  (`grok-bot/application-operator/OPERATIONAL_SKILL.md` passo 5; `deploy_bots.py`). O botão de currículo
  separado é útil para adiantar o CV, mas não é pré-requisito do botão de candidatura.
- **CVerino só gera currículo para `ATTACHMENT`/`HYBRID`** e exige `runtime/resume-master-snapshot.md`
  (`grok-bot/cv-strategist/OPERATIONAL_SKILL.md`); sem isso responde `BLOCKED`.
- **Curriculinho nunca edita o MASTER**: duplica, edita a cópia e exporta `cv.pdf` + `cv.json`
  (`grok-bot/cv-operator/OPERATIONAL_SKILL.md` passos 8–19). O pedido "edita o currículo master" vira
  "edita uma cópia do master".
- **Nada é enviado.** `SUBMIT_ENABLED=False`, `AUTO_ENABLED=False`; `submit_gate.py` bloqueia o clique
  final. O Candidatinho para em `READY_TO_SUBMIT`/`AWAITING_APPROVAL`.
- **Aprovação no chat do Candidatinho**: só `ok <8 hex>` digitado no Bot Chat dele vale
  (`deploy_bots.py`). Um disparo do painel cai nesse mesmo chat como turno humano, então o painel **nunca**
  pode enviar texto livre ali.
- **Teto de gasto**: ledger por perfil com padrão US$ 0,10 (`JSB_GATEWAY_BUDGET`, `serve.sh`). Uma rodada de
  `/cotar-vagas` pode estourar e voltar `BUDGET_EXCEEDED`.
- **Dívida conhecida**: `OPERATOR_CONTEXT_TOO_LARGE` no Candidatinho (`RUNTIME.md` § Dívida).
- **Posse de sessão**: se o Bot Chat estiver aberto no Desktop, outro cliente pode receber
  `SESSION_NOT_OWNED` (`hermes_cli/active_sessions.py` do Hermes fixado); o Hermes tem um caminho de entrega
  ao "dono vivo" (`tools/bot_live_delivery.py`, usado por `methods_bot_relay.py`). Ainda não sei qual RPC
  um cliente externo deve usar nesse caso: é o primeiro item do spike.

## Mudança de contrato

Hoje (`2026-09-25-job-search-visual-layer.md`): painel **somente leitura**. Proposta:

- O painel passa a ter **comandos de disparo**: pede a um bot que comece um trabalho, com um texto fixo e
  versionado no job-search. É o equivalente a digitar a primeira mensagem no Bot Chat, nada além disso.
- Continua proibido:
  - escrever na Sheet diretamente (credencial do painel segue `spreadsheets.readonly`); a única escrita indireta é
    pedir ao job-search que persista um writeset VALID (D3 revista), com a credencial dele;
  - ler private store, `runtime/applications/*` ou credenciais dos bots pelo painel;
  - texto livre para bots, aprovar candidatura, responder `ok <código>`, enviar candidatura;
  - recalcular regra do job-search: bloqueios no painel são só UX; a autoridade é o dispatcher e o
    próprio bot (`application.py claim`/dedup, gate).
- O job-search continua autoridade: templates dos comandos, pré-condições e a lista de ações permitidas
  vivem **lá**, não no painel.
- Atualizar `CLAUDE.md` e o plano de 2026-09-25 (tabela "Fontes de verdade", regra "nunca escreve") no fim.

## Mecanismo proposto

**Dispatcher no job-search** (`hermes/browsers/dispatch.py`, novo, com testes), chamado pelo servidor do
painel via `execFile` com argv estruturado (sem shell), na mesma máquina:

```text
dispatch.py start  <ACAO> [--job-id ID]   → imprime JSON {dispatch_id, status}
dispatch.py status <dispatch_id>          → JSON {status, token, updated_at, ...}
dispatch.py list   [--active]             → JSON
```

- `ACAO` ∈ `BUSCAR_VAGAS` (Lince), `PREPARAR_CURRICULO` (CVerino), `PREENCHER_CANDIDATURA`
  (Candidatinho). Enum fechado; texto enviado = template versionado no job-search + `job_id` validado com a
  mesma regex de `agent_messages.JOB_ID_RE`. Nenhum campo livre vindo do painel.
- `start` valida pré-condições, grava o registro do disparo, desanexa um processo filho que abre o Bot
  Chat pelo `/api/ws` (como o Desktop), faz `prompt.submit`, espera `message.complete` e grava o
  resultado. O painel recebe a resposta na hora (não espera o bot).
- O token do gateway fica no job-search: o dispatcher lê o arquivo; o painel nunca vê o token nem o
  caminho dele.
- Por que no job-search e não direto no painel: as regras de "quem pode ser acionado, com que texto, em que
  estado" são do job-search; o painel não passa a depender de detalhes internos do Hermes; o dispatcher
  pode reusar `application.py status` e `dossier.py validate` para as pré-condições. **Exige mudança no
  job-search** (branch e PR próprios lá).
- Alternativa descartada: o painel falar `/api/ws` direto (duplica regras, espalha o token, acopla o
  Next ao protocolo do Hermes fixado).

Pré-condições (o dispatcher recusa com código; o painel desabilita o botão pelos mesmos motivos, só UX):

| Ação                    | Recusa quando                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| todas                   | gateway parado ou fora do modo `profile` (`serve.sh status`); disparo ativo igual já existe                                                                                                                                                                                                                  |
| `PREENCHER_CANDIDATURA` | dossier não `VALID` ou não `SELECIONADA`+`ABERTA` (`dossier.py validate`); estado runtime `SUBMITTING`/`SUBMIT_UNCERTAIN`/`SUBMITTED`/`CLOSED`/`FAILED` (`application.py status`); lock global `runtime/applications/.lock` de outra tentativa; outro disparo de candidatura ativo (o operador é um por vez) |
| `PREPARAR_CURRICULO`    | dossier não `VALID`/`SELECIONADA`/`ABERTA`; disparo de currículo ativo para a mesma vaga                                                                                                                                                                                                                     |
| `BUSCAR_VAGAS`          | outra busca ativa                                                                                                                                                                                                                                                                                            |

No painel, adicionalmente (lido da Sheet, só UX): `ENVIO INCERTO` (`uncertainSubmit`), `ENVIADA`,
`RETIRADA`, aba Encerradas, análise diferente de `FULL` → botão desabilitado com o motivo. O dedup real
(Sheet + runtime + portal) continua no `application.py claim` do Candidatinho.

## Status do disparo sem banco

- Registro por disparo em `~/.local/state/job-search-hermes/dispatch/<dispatch_id>.json` (0600, escrita
  atômica), dono = job-search. Campos: `action`, `job_id`, `status`, `token`, `created_at`, `updated_at`,
  `pid`, `workflow_id` se houver. **Sem** texto da resposta do bot (pode conter posting não confiável e
  dados do candidato).
- Estados: `PENDENTE` (gravado, filho ainda não entregou) → `RODANDO` (`prompt.submit` aceito) →
  `CONCLUIDO` | `FALHOU` (com código: `GATEWAY_DOWN`, `SESSION_NOT_OWNED`, `BUDGET_EXCEEDED`,
  `TIMEOUT`, …) | `PRECISA_HUMANO`. `token` = primeiro marcador conhecido na resposta final
  (`READY_TO_SUBMIT`, `AWAITING_APPROVAL`, `HUMAN_REQUIRED`, `HUMAN_AUTH_REQUIRED`, `PATCH_READY`,
  `BLOCKED`, `BLOCKED_EDITORIAL`, `WAITING`), só para exibir.
- Processo filho morto com registro em `RODANDO` vira `INCERTO` (o turno pode seguir no gateway). Para
  candidatura, `INCERTO` bloqueia novo disparo até o usuário conferir no Desktop e liberar
  (`dispatch.py ack <id>`, ação explícita no painel com confirmação).
- Painel: server action `getDispatchStatus()` (lê via `dispatch.py status|list`), cliente faz polling a
  cada 5 s só enquanto houver disparo ativo; nada em `localStorage`. Para detalhes o usuário abre o Bot Chat
  no Hermes Desktop.

## Segurança

- Toda Server Action nova (`startDispatch`, `getDispatchStatus`, `ackDispatch`) chama
  `getAllowedSession()` antes de qualquer coisa; o proxy não protege Server Functions. Sem Route Handler
  novo (se surgir, mesma regra e 401 pelo proxy).
- `action` validada por zod contra o enum; `job_id` pela regex e precisa existir no snapshot atual da
  Sheet. Nada vindo do cliente vira texto do bot.
- Confirmação na UI (Radix `Dialog`, já em `components/ui/dialog.tsx`) com o que vai acontecer, o bot, a
  vaga e o lembrete "nada é enviado; o bot para antes do botão final".
- Idempotência: um disparo ativo por `(ação, job_id)`; candidatura com um ativo no total; o botão fica
  `disabled` enquanto a action roda (evita clique duplo); o dispatcher recusa de novo se a corrida passar.
- Segredos só no servidor e no job-search: caminho do `dispatch.py` e do Python do runtime via env do
  servidor (`JOB_SEARCH_REPO`, `JOB_SEARCH_DISPATCH_ENABLED`), nunca `NEXT_PUBLIC_*`. Sem token no cliente,
  em argv ou em log.
- `execFile` com timeout curto, argv fixo, env mínimo; stdout parseado por zod; erro vira código, nunca
  stack no cliente.
- Recurso desligado por padrão (`JOB_SEARCH_DISPATCH_ENABLED` ausente = botões não aparecem): fixture, CI e
  E2E não acionam bot real.

## Posição no visual "Caça"

- `/vaga/[job_id]`: coluna de ações do cabeçalho (`app/(dashboard)/vaga/[job_id]/page.tsx`, bloco de
  `link-principal`). Acima dos links: **"Preencher candidatura"** (primário, tom `st-open`, ícone de robô)
  e **"Preparar currículo"** (secundário). Abaixo, um chip de status do último disparo da vaga (cor + ícone
  - rótulo, regra dos tokens `--st-*`). Com vaga encerrada/enviada/incerta: botões ocultos ou desabilitados
    com o motivo.
- `/` "Hoje": **"Buscar vagas"** ao lado de `SyncButton` (linha de ações do herói). Após `CONCLUIDO`:
  aviso "Busca concluída; writeset aguardando persistência" (enquanto D3 não mudar) e realce do
  "Sincronizar".
- `/vagas`: mesmo botão nas ações do `PageHeader`.
- Cartões da fila: sem botões de bot (evita disparo acidental); só o chip de status se houver disparo
  ativo.

## Work units (uma preocupação por branch)

- [ ] **WP0 Spike (sem código de produto)**: com o gateway real, um script descartável no scratchpad
      abre o Bot Chat de um perfil barato e faz `session.list`/`resume`; medir: (a) `prompt.submit` com o
      Desktop fechado; (b) com o Bot Chat aberto no Desktop (`SESSION_NOT_OWNED` ou entrega ao dono vivo?);
      (c) se a mensagem aparece no Desktop. Sem mandar tarefa real. Resultado registrado aqui.
- [ ] **WP1 job-search: `hermes/browsers/dispatch.py`** (repo job-search, branch própria): enum de ações,
      templates, pré-condições, registro de status, filho desanexado, `status/list/ack`; testes com gateway
      falso (mesmo estilo de `test_agent_messages.py`, MockLLM, porta temporária); doc em `RUNTIME.md`;
      `validate_job_search.py`, `unittest`, `git diff --check`. Não tocar em `agent_messages.py` (há alteração
      local que não é deste trabalho).
- [ ] **WP2 painel: camada de disparo** (`lib/ops/dispatch.ts` server-only + `app/actions/ops.ts`):
      `execFile`, zod, flag, sessão; testes Vitest com dispatcher falso (sessão ausente → recusa; ação/`job_id`
      inválidos; erro do dispatcher vira código; flag desligada).
- [ ] **WP3 painel: UI** — botões, diálogo de confirmação, chip de status, polling; regras de habilitação em
      `present.ts` (só apresentação); testes unitários dos helpers.
- [ ] **WP4 E2E**: com `JOB_SEARCH_DISPATCH_ENABLED` apontando para um dispatcher falso de teste — confirmar
      diálogo, cancelar não dispara, disparo mostra `PENDENTE`→`CONCLUIDO`, botão desabilitado com ENVIO
      INCERTO, sem sessão a action recusa.
- [ ] **WP5 Validação real controlada**: uma vaga real `SELECIONADA`+`ABERTA` escolhida pelo dono, só
      "Preparar currículo" primeiro; depois "Preencher candidatura" até `READY_TO_SUBMIT`; "Buscar vagas" uma
      vez com teto de gasto combinado. Registrar o que foi e o que não foi verificado.
- [ ] **WP6 Docs**: `CLAUDE.md` do painel, plano de 2026-09-25, `README.md` do job-search.

## Testes e quality gates

- Painel, por WP: `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`,
  `pnpm test:e2e` (porta 3000 com `E2E_AUTH_ENV`; a porta 3000 está ocupada agora, perguntar antes de
  encerrar o processo). Para ver telas: `next build` + `next start` (o `next dev` falha por EMFILE).
- job-search: `python3 scripts/validate_job_search.py`,
  `python3 -m unittest discover -s scripts -p 'test_*.py'`, testes do dispatcher com o venv do runtime,
  `git diff --check`.
- Nenhum teste automatizado fala com o gateway real nem gasta crédito.

## Decisões em aberto (dono)

- **D1 Canal**: Hermes para as três ações (recomendado; é o único com canal local documentado) ou manter
  alguma no Grok (exige descobrir como acioná-lo; nada no repositório)?
- **D2 "Severino"** = CVerino (`jobsearchcverino`)? E o botão de currículo deve existir separado, sabendo
  que o Candidatinho já chama CVerino/Curriculinho sozinho?
- **D3 Persistência da busca**: (a) continua com o coordenador, painel só avisa "writeset pendente"
  (recomendado para v1); (b) botão "Persistir writeset" que roda `writeset.py persist` via dispatcher
  (painel dispara uma escrita na Sheet, mesmo sem credencial própria); (c) Lince passa a persistir sozinho
  (muda a metodologia do job-search).
- **D4 Status**: aceitar o registro de disparos em `~/.local/state/job-search-hermes/dispatch/` e mostrar
  só estado + marcador, sem o texto da resposta?
- **D5 Teto de gasto** por disparo de busca (padrão atual US$ 0,10 por perfil).
- **D6 Ordem**: começar pelo WP0 (spike de sessão no Bot Chat) antes de abrir qualquer branch?

## Riscos

- Protocolo `/api/ws` e posse de sessão dependem do Hermes fixado (`f24a1d7f`); se mudar, o dispatcher
  quebra (mitigação: testes com gateway real efêmero, como os do `agent_messages.py`).
- Turno longo do Candidatinho (`OPERATOR_CONTEXT_TOO_LARGE`) e login humano no meio (Browser D, Cloud
  Design, ChatGPT): o status vai ficar muito tempo em `RODANDO`/`PRECISA_HUMANO`; a UI precisa dizer onde
  agir.
- Disparo do painel no Bot Chat do Candidatinho é indistinguível de um turno humano: a proibição de texto
  livre é a principal defesa; vale adicionar no job-search uma assinatura "origem: painel" no template.
