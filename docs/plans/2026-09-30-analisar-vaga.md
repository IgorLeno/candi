# Analisar vaga: análise no ChatGPT de uma vaga já registrada, pelo painel

Data: 2026-09-30. Status: **aprovado pelo Igor em 2026-09-30 e implementado** (branches `feat/analyze-job` nos dois
repos, empilhadas; nada enviado ao remoto). Repos: `job-search` (dispatcher,
pipeline, autoridade) e `estagios-dashboard` (botão, acompanhamento, registro).

## Pedido

No detalhe da vaga (`/vaga/[job_id]`), caixa "BOTS", um botão **"Analisar"** ao lado de "Gerar currículo" e
"Preencher vaga". Ele pede ao job-search a análise profunda no ChatGPT de **uma** vaga que já está na planilha (91
registradas, 90 sem dossier). Nada em lote. Ciclo: clique → confirmação → disparo → job-search lê a vaga da planilha,
obtém o texto da vaga e leva ao ChatGPT → writeset (aba `Dossiers` + colunas de classificação) → gravação na planilha
pelo fluxo de writeset do job-search → "Sincronizar" no painel mostra a análise. Vale também para vaga já enviada
(ex.: `11132619`, Usiminas, SELECIONADA, ENVIADA, sem dossier): o objetivo é preencher o dossier.

## O que existe hoje (verificado no código em 2026-09-30)

- `job_analysis.py` (job-search, branch `feat/decline-job`, não está na `main`): análise no host, sem Bot, via
  `chatgpt_exchange.py` (CDP). Entrada = backlog local `runtime/applications/<job_id>/state.json` com
  `status = AGUARDANDO_ANALISE_CHATGPT` + `posting.md`. Saída = `analysis/<id>.json`, `dossier.json` (só
  SELECIONADA) e `writeset.md` que passa `writeset.py check`.
- `writeset.py persist` → `RegistryWriter.apply_writeset`: UPSERT por `job_id` (**atualiza a linha existente, não
  duplica**; `ROW_DUPLICATED` se houver duas), preserva `status_candidatura`/`data_candidatura` quando a planilha está
  mais adiantada (ENVIADA, ENVIO INCERTO, RETIRADA > NÃO INICIADA). Dossiers: append idempotente por
  `(job_id, dossier_sha256)`; o painel usa o mais recente (`latestDossiers`). Ou seja, o writeset já suporta
  reanálise de vaga existente sem duplicar linha.
- Lacunas para vaga já registrada:
  1. **Entrada**: só 41 vagas têm diretório local em `runtime/applications/` (39 `ANALISADA`); `11132619` não tem. A
     vaga precisa vir da **linha da planilha** (empresa, cargo, url, fonte, portal) e o texto da vaga de uma fonte:
     `posting.md` local → `posting_md` da aba Dossiers (não truncado, caso de refazer) → página guest do LinkedIn
     (`job_discovery.read_linkedin_job`, só `job_id` numérico). Outras fontes (Gupy, Vagas.com.br etc.) ficam sem
     texto na v1: código `POSTING_UNAVAILABLE` (precisa de você).
  2. **`state.json` é compartilhado** com o Application Operator (`application_state.py`). `Analysis.run` sobrescreve
     `status` com `ANALISADA`: numa vaga com candidatura isso corromperia o estado. O fluxo novo **não toca
     `state.json`**.
  3. **Linha do UPSERT**: `upsert_row` grava `data_primeira_analise = hoje`, `status_candidatura = NÃO INICIADA` e
     `observacoes` fixo, e reescreve identidade com o que está no `state.json`. Para vaga registrada a linha precisa
     partir da **linha atual da planilha** e trocar só os campos da análise (`familia_funcao`, `tipo_programa`,
     `proximidade_eq`, `setor`, `interesse`, `application_model`, `data_ultima_analise`, `status_analise`,
     `status_disponibilidade`, `motivo_analise`, `gate_decisivo`; `data_primeira_analise` só se vazia).
  4. **Dossier só de SELECIONADA** no `finalize`: NÃO PRIORIZADA/DESCARTADA ficam só com a classificação na linha. O
     contrato `dossier/1` aceita os três status.

## Proposta

### job-search (autoridade)

Ação nova `ANALISAR_VAGA` no `dispatch.py`, pipeline no host (`_analyze`), **por vaga**, só `job_id` do painel:

    dispatch.py start ANALISAR_VAGA --platform hermes --job-id <job_id>
    dispatch.py persist <dispatch_id da ANALISAR_VAGA>        (existente; WRITESET_ACTIONS ganha ANALISAR_VAGA)

- `ACTIONS["ANALISAR_VAGA"] = {per_job: True, host: True, hermes_only: True, bot: "ChatGPT (host)"}`. Não passa por
  `preconditions` de dossier/ação (essas exigem SELECIONADA e ABERTA): tem pré-condições próprias.
- Pré-condições (recusa com código): `JOB_ID_INVALID`; `DISPATCH_ACTIVE` (análise desta vaga já rodando);
  `CHATGPT_BUSY` (outro pipeline do host que usa o ChatGPT rodando: BUSCAR_VAGAS, GERAR_CURRICULO, ANALISAR_VAGA);
  `PLATFORM_NOT_SUPPORTED` para `grok`. A linha da planilha é lida no filho (não no `start`, para o painel responder
  rápido): `ROW_NOT_FOUND`/`REGISTRY_UNAVAILABLE` viram `FALHOU`, `ROW_DUPLICATED` vira `PRECISA_HUMANO`.
- Filho `_analyze` (etapas no registro, nunca texto do ChatGPT): `planilha` (lê a linha, só leitura, credencial do
  job-search) → `posting` (fontes na ordem acima; `POSTING_UNAVAILABLE` = PRECISA_HUMANO) → `chatgpt`
  (`job_analysis` com um lote de 1, mesma metodologia/prompt/validação/FORMAT_REPAIR) → `availability` (LinkedIn
  guest; senão `NÃO CONFIRMADA`) → `writeset` (`writeset.py check` VALID) → CONCLUIDO/`WRITESET_COMPLETE`.
- `job_analysis.py`: entrada nova `analyse_registered(row, posting)` que monta o `job` a partir da linha, grava só no
  op_dir (`runtime/operations/<id>/analysis/`, `posting.md`, `writeset.md`), **sem tocar `state.json`**; linha do
  UPSERT a partir da linha atual (item 3); DOSSIER_ROWS para **qualquer** status (decisão 2).
  `dossier.json` local só quando a vaga não tem diretório/dossier no runtime (não sobrescreve o de uma candidatura).
- `progress()` para `ANALISAR_VAGA`: "Dados da vaga (planilha)", "Texto da vaga", "Análise no ChatGPT", "Writeset
  pronto", "Registro na planilha" + `diagnosis` de `writeset.py rows` (como a vaga indicada).
- Nada muda em `writeset.py`, `sheets_client.py`, BUSCAR_VAGAS nem na vaga indicada.

### Painel

- `lib/ops/schema.ts`: `ANALISAR_VAGA` em `DISPATCH_ACTIONS` (fora de `BOT_ACTIONS`, como a vaga indicada).
- `app/actions/ops.ts`: `analyzeJob(jobId)` = `getAllowedSession()` → `JOB_ID_RE` → vaga existe no snapshot
  (`JOB_NOT_FOUND`) → `dispatch.py start ANALISAR_VAGA --platform hermes --job-id <id>`. Só o `job_id` sai do painel;
  nenhum texto livre.
- `lib/ops/present.ts`: labels, textos de recusa novos, `analyzeJobBlocker()` (UX: bloqueia só com análise desta vaga
  ativa; **não** usa `jobDispatchBlocker`, então vale para ENVIADA/RETIRADA/encerrada). Rótulo "Refazer análise"
  quando a vaga já tem dossier válido.
- `components/job-search/ops.tsx` (`JobOps`): botão "Analisar" (ou "Refazer análise") com diálogo de confirmação
  (sem seletor de plataforma; diz que o veredito do ChatGPT pode mudar `status_analise` e que a candidatura não muda);
  card do disparo com etapas, diagnóstico e o `WritesetRegistration` existente ("Registrar na planilha"), que relê a
  planilha ao terminar. `canRegisterWriteset`/`withRegistration` já servem.
- Fake dispatcher E2E: `ANALISAR_VAGA` (etapas, writeset com o job_id pedido, `persist` aceitando a ação).

## Decisões (Igor, 2026-09-30)

1. Gravação na planilha: **"Registrar na planilha" manual** (padrão existente; o veredito aparece antes de
   sobrescrever `status_analise`).
2. Dossier: **sempre**, qualquer que seja o `status_analise`.
3. Vaga com dossier válido: **"Refazer análise"** permitido (o dossier novo é anexado, o mais recente vale).
4. Branches **empilhadas**: painel sobre `test/e2e-application-dialog-copy`, job-search sobre `feat/decline-job`.

Grok: fora (Hermes só, como a vaga indicada): o pipeline é do host e o Grok não lê a planilha nem o runtime.

## Work units

job-search (primeiro, é a autoridade):

- [x] J1 `job_analysis.py`: `analyse_registered` (job a partir da linha, sem `state.json`), linha de UPSERT que
      preserva a linha atual, DOSSIER_ROWS conforme decisão 2. Testes (Sheet fake, exchange fake): vaga ENVIADA
      mantém `status_candidatura`/`data_candidatura`/`data_primeira_analise`/`observacoes`; writeset VALID; nenhum
      `state.json` alterado.
- [x] J2 `dispatch.py`: `ANALISAR_VAGA` (ações, pré-condições, `_analyze`, fontes do posting, `progress`,
      `goal_reached`, `persist` aceita). Testes em `test_dispatch.py`.
- [x] J3 Docs: `RUNTIME.md` § Disparo pelo painel, docstring do `dispatch.py`. `python3 -m unittest` dos testes
      tocados e `python3 scripts/validate_job_search.py`.

estagios-dashboard:

- [x] D1 schema, `analyzeJob`, `canAnalyzeJob`, labels/recusas. Vitest (gating, action com sessão ausente/job_id
      inválido/vaga ausente).
- [x] D2 UI em `JobOps` + fake dispatcher + spec E2E (analisar → etapas → registrar → relê; vaga ENVIADA com botão
      habilitado; recusa `POSTING_UNAVAILABLE`).
- [x] D3 Docs: `CLAUDE.md` (exceção nova na lista do que o painel dispara), contrato de 2026-09-29, este plano com o
      resultado.

Quality gates: job-search (unittest, validador); painel (`pnpm lint`, `format:check`, `tsc --noEmit`, `pnpm test`,
build + Playwright numa cópia no scratchpad, porta 3100, dispatcher falso).

## Resultado (2026-09-30)

- job-search `25344aa` (J1): `read_registered`, `registered_posting`, `reanalysis_row`,
  `Analysis.analyse_registered`. `test_job_pipeline.py` 13/13 (5 novos; inclui persistência numa Sheet em memória:
  mesma linha `UPDATED`, `status_candidatura`/`data_candidatura`/`data_primeira_analise`/`observacoes`/`origem_skill`
  preservados, dossier anexado; `state.json` de candidatura intacto).
- job-search `8274756` (J2, J3): `ANALISAR_VAGA` no `dispatch.py` (`_analyze`, `CHATGPT_BUSY`, credencial só para esse
  filho, `progress` com etapas/fonte do posting/diagnóstico, `persist` aceita), `RUNTIME.md`. `test_dispatch.py` 47/47
  (6 novos), `validate_job_search.py` OK. Suíte inteira: tudo OK menos `test_runtime_policy.py`
  (`test_A_openrouter_expected_and_effective_pass`, `KeyError: 'SAFE_TOOL_SURFACE'`), que falha igual num snapshot
  de `feat/decline-job` sem estas mudanças.
- Painel (D1–D3): `ANALISAR_VAGA` no schema, `analyzeJob`, `analyzeJobBlocker`, botão "Analisar"/"Refazer análise"
  com confirmação em `JobOps`, card com etapas, diagnóstico e "Registrar na planilha", fake dispatcher e 2 specs E2E.
  Gates: lint (0 erros, 2 avisos antigos), prettier, `tsc --noEmit`, Vitest 173/173, `next build` e Playwright 26/26
  numa cópia no scratchpad servida na 3100 com o dispatcher falso; screenshots do botão, do diálogo e do card
  concluído (escuro, 1280 px) conferidos.

## Não verificável aqui

Rodada real no ChatGPT (login, tempo, custo) e gravação na planilha real: ficam para o primeiro disparo do Igor, com
autorização.
