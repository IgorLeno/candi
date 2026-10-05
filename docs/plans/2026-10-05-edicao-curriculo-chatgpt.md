# Pedir edição com revisão do ChatGPT (2026-10-05)

Problema: em `/vaga/[job_id]`, "Pedir edição do currículo" manda o texto do usuário direto ao Claude in Chrome
(decisão 2026-10-03, opção B: `cv_edit.py`, handoff `editorial_source: USER` / `editorial_review: USER_REQUEST`,
sem ChatGPT). Pedido do usuário: um controle no card para escolher entre

- (a) como hoje: o pedido vai direto ao Claude in Chrome;
- (b) o ChatGPT analisa o pedido antes e só depois vai ao Claude.

Muda uma decisão anterior do usuário e atravessa os dois repositórios (contrato do `dispatch.py` + painel): só
implementar depois do ok explícito às decisões abaixo.

## Como é hoje (lido no código)

- Painel: `editCv(jobId, {platform, text})` → `dispatch.py start EDITAR_CURRICULO --platform hermes|grok --job-id
<id> --request-stdin`; texto só por stdin, guardas de `normalizeIntake` (`REQUEST_*`).
- job-search: `dispatch.start` grava `pedido-edicao.md` (0600) e `cv_edit.prepare` grava `resume-edit-handoff.md`
  (PATCH_READY, `edit_of`, `-vN`, texto fixo `WRAPPER` + pedido em `## CLAUDE INSTRUCTIONS`). Pré-condições:
  `CV_NOT_READY`, `CV_DOC_AT_OTHER_JOB`, `CV_DOC_BUSY`; Hermes também `CLOUDDESIGN_CDP_DOWN`/`CLAUDE_PANEL_CLOSED`.
  Filho `_cvedit`: `promote` → `cv_claude_chrome.Runner.edit` → `wait` → `cv_export.verify`.
- `cv_export.EDITORIAL_MARKS` aceita só `(CHATGPT, REQUIRED)` e `(USER, USER_REQUEST)`.
- GERAR_CURRICULO no host (`cv_pipeline.py`): ChatGPT (`chatgpt_exchange`, um pipeline com ChatGPT por vez,
  `CHATGPT_BUSY`) é autor e validador factual contra `knowledge/`; parser local de formato (CHANGE com 8 campos,
  `target_text` presente no snapshot, DÚVIDAS), no máximo um FORMAT_REPAIR; dúvida → handoff BLOCKED /
  `HUMAN_REVIEW_DOUBTS` (PRECISA_HUMANO). O CV Strategist (Bot) é só fallback legado; o host não o usa.
- Grok: comando fixo para o CV Operator rodar `cv_claude_chrome.py edit`; o texto nunca entra no comando.

## Desenho proposto (recomendações; decisões abertas no fim)

- Contrato: flag fixa `--chatgpt-review` em `dispatch.py start EDITAR_CURRICULO` (sem valor, sem texto no argv).
  Texto continua só por stdin com as mesmas guardas. Só Hermes: com `--platform grok` → `CHATGPT_REVIEW_HERMES_ONLY`.
  Pré-condição extra no modo (b): `CHATGPT_BUSY` (mesma regra dos outros pipelines do host com ChatGPT).
- Modo (b) no host (`_cvedit` com `chatgpt_review: true` no registro): prompt fixo novo em `cv_edit.py`
  ("PEDIDO DO IGOR" como dado, CURRÍCULO ATUAL = snapshot do idioma, que é o texto do PDF desta vaga por causa de
  `CV_DOC_AT_OTHER_JOB`, EVIDÊNCIAS = os mesmos `FACTS` de `cv_pipeline`, mesmas REGRAS). Resposta no formato do
  GERAR_CURRICULO (CHANGE/KEEP/NÃO ADICIONAR/ENCAIXE/DÚVIDAS), validada pelo mesmo `parse`/`validate`, um
  FORMAT_REPAIR no máximo. A resposta vira `## CLAUDE INSTRUCTIONS` do handoff de edição (inteira, sem edição),
  mantendo `edit_of` e `-vN`. Sem gate humano entre ChatGPT e Claude (igual ao GERAR).
- Etapas no card: pedido → ChatGPT (revisão do pedido) → Claude in Chrome → currículo novo. No modo (a) as etapas
  ficam como hoje.
- Painel: switch acessível (`role="switch"`, rótulo "Revisar o pedido no ChatGPT antes") no card; a descrição do card
  e o botão dizem o caminho escolhido; com Grok o switch fica desligado e desabilitado, com o motivo.
  `editCv` aceita `chatgptReview: boolean` (zod strict) e acrescenta a flag.

## Decisões (respondidas pelo usuário em 2026-10-05: todas as recomendadas)

1. Papel do ChatGPT no modo (b): (i) patch completo no formato do GERAR, conferido contra `knowledge/` e ancorado
   no currículo atual (recomendado: reaproveita parser/validador e a regra "ChatGPT não é fonte de fatos"); ou
   (ii) só reescrever o pedido em instruções claras para o Claude, sem conferência factual.
2. Marcas do handoff: (i) par novo `USER` / `CHATGPT_REVIEW` (recomendado: registra que a edição nasceu do usuário
   e foi revisada); ou (ii) reaproveitar `CHATGPT` / `REQUIRED`. Misturas continuam recusadas.
3. ChatGPT com dúvida ou que recusa o pedido: (i) PRECISA_HUMANO `HUMAN_REVIEW_DOUBTS`, o card mostra as dúvidas em
   texto e o usuário reescreve o pedido (recomendado); ou (ii) também oferecer "Mandar direto ao Claude assim mesmo".
4. Padrão e plataforma: switch desligado a cada abertura (mantém a opção B como padrão), só Hermes (recomendado);
   ou lembrar a escolha por navegador.
5. CV Strategist: não valida (o host não usa o Bot; validação = ChatGPT + parser local + conferência do usuário).

## Checklist (depois do ok)

job-search (commits próprios):

- [x] `cv_edit.py`: prompt fixo do modo (b), `render` com as marcas escolhidas, etapa ChatGPT reaproveitando
      `cv_pipeline.parse`/`validate`/`chatgpt_exchange`
- [x] `cv_export.EDITORIAL_MARKS` (se par novo)
- [x] `dispatch.py`: `--chatgpt-review`, recusas (`CHATGPT_REVIEW_HERMES_ONLY`, `CHATGPT_BUSY`), registro,
      etapas do `progress`, `_cvedit` com a etapa ChatGPT; docstring e RUNTIME.md
- [x] metodologia: `resume-handoff.md` (seção da exceção) e `resume-tailoring.md`
- [x] testes: `test_cv_edit.py`, `test_dispatch.py`; `pytest -q` (12 falhas pré-existentes) e
      `scripts/validate_job_search.py`

painel (commits próprios):

- [x] `editCv` com `chatgptReview` e a flag; textos de recusa novos em `present.ts`
- [x] switch no `CvEditForm`, descrição e botão dizem o caminho; desabilitado com Grok
- [x] fake do e2e aceita a flag e devolve as etapas do modo (b)
- [x] testes unitários (`actions.test.ts`, componente) e e2e (`ops.spec.ts`) em cópia fora da 3000
- [x] CLAUDE.md (trecho do "Pedir edição")
- [x] gates: format:check, lint, tsc, test, e2e

Achado no caminho: o `argparse` do `dispatch.py start` não declarava `--request-stdin`, então o "Pedir edição" real
sempre recusava (o fake do e2e aceitava). Corrigido em commit próprio no job-search, com teste do CLI.

## Resultado (2026-10-05)

- job-search: `7d8d7e7` fix do `--request-stdin`; `aa01543` refactor do prompt (`PROMPT` idêntico, mesmo sha256);
  `a429de1` revisão no ChatGPT. `test_dispatch`, `test_cv_edit`, `test_cv_export`, `test_cv_pipeline` verdes; pytest
  completo com 13 falhas, todas em `test_tool_surface`, `test_runtime_policy` e `test_agent_messages`;
  `validate_job_search.py` só com a falha conhecida em `runtime/applications/gupy-12484524/`.
- painel: format:check, lint (2 warnings já existentes), tsc, vitest de `present`/`actions` verdes; `e2e/ops.spec.ts`
  17/17 numa cópia em `localhost:3107` (fixture + fake). Conferência visual do switch na mesma cópia.
- Não verificado: ChatGPT e Claude reais (fora do escopo); `pnpm test` inteiro não rodou de uma vez (máquina
  carregada), só `__tests__/lib/ops` (6 arquivos, 96 testes).

Fora do escopo: rodar bots reais, ChatGPT/Claude do usuário, gravar na Sheet, push.
