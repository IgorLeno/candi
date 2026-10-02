# Currículo travado: menos paradas no Claude e retomada pelo painel

Data: 2026-10-02. Status: **aprovado pelo Igor em 2026-10-02** ("Outro" vai ao ChatGPT; `resume-cv` com `claude`|`chatgpt`; seção de encaixe obrigatória).
Repos: `job-search` (autoridade: skill, prompt do ChatGPT, dispatcher) e `estagios-dashboard` (card do currículo).

## Caso real (vaga 5201317008, Agibank)

GERAR_CURRICULO terminou `PRECISA_HUMANO` / `BLOCKED_CLAUDE_CHROME:CLAUDE_STOPPED_WITHOUT_PDF`
(`hermes/browsers/cv_claude_chrome.py` `_wait`: Claude parado 30 s sem PDF novo). O card só oferecia "Dispensar".

Causa, pelo que está no runtime:

- O snapshot PT (`runtime/resume-master-snapshot.md`) é da Sun Pharma (2026-09-30, 2 categorias de competência). O
  documento de trabalho no Claude Design mudou depois sem novo PDF (rodada que duplicou células e deixou "Comp 3"/
  "Comp 4"). O patch do ChatGPT foi escrito contra o snapshot, então CHANGEs 3–6 não batiam com o documento.
- A skill tratou restrição de forma como bloqueio: resumo com 5 linhas contra "~4" do `length_constraint`, e as
  categorias placeholder sem conteúdo no patch. Terminou perguntando no chat (o trecho final do painel pede
  "confirmação de que posso reduzir o grid para 2 categorias e ... encurtar o resumo"), apesar de a skill dizer para
  não pedir decisão no meio da edição.

## A. Contrato do currículo (job-search)

Arquivos do fluxo do host (conferido por grep): o prompt e o parser vivem em `hermes/browsers/cv_pipeline.py`; o
`cv_claude_chrome.py` cola o bloco `## CLAUDE INSTRUCTIONS` depois de `/ajustar-curriculo`; a skill da conta é a cópia
versionada `grok-bot/cv-operator/ajustar-curriculo/SKILL.md` (colada à mão na conta claude.ai). Documentam o contrato:
`methodology/resume-handoff.md` (schema, `mandatory`, prompt fixo), `methodology/resume-tailoring.md` e
`grok-bot/cv-operator/OPERATIONAL_SKILL.md` (tabela de códigos).

- [x] A1 Skill `/ajustar-curriculo`:
  - resumo (e todo `replacement_text`) aplicado exatamente; `length_constraint` é orientação de diagramação, nunca
    motivo de parada;
  - regra única de forma: UMA página, sem texto cortado. Para caber, nesta ordem: (1) remover do grid de
    Competências as categorias que o patch não preencheu (placeholder tipo "Comp N", descrição repetida ou categoria
    que o ChatGPT mandou remover); (2) aplicar o plano de encaixe do ChatGPT (A2); (3) omitir `mandatory: no`;
    (4) ajustar largura das caixas de texto/colunas do grid até o necessário. Nunca inventar conteúdo, nunca mudar
    fonte/tamanho/cor (sem pedido);
  - `target_text` que não bate: aplicar o `replacement_text` no bloco correspondente (mesma seção e posição/papel),
    sem parar, e registrar a divergência no relatório;
  - nunca perguntar no chat; parar (NÃO EXPORTADO) só em impossibilidade real, com motivo claro numa linha
    `MOTIVO:`: `mandatory: yes` sem bloco correspondente; não cabe em uma página depois dos 4 passos; documento
    embaralhado sem volta pelo Ctrl+Z; funções proibidas exigidas.
- [x] A2 Prompt/parser do ChatGPT (`cv_pipeline.py`): seção nova obrigatória **`ENCAIXE EM UMA PÁGINA`** (o que
      remover ou encurtar se faltar espaço, em ordem, e quais categorias do grid manter); `length_constraint` descrito
      como orientação (o resumo não tem limite de linhas). Parser lê a seção como lista; `validate` exige a seção (uma
      rodada de FORMAT_REPAIR já existe). `render_handoff` grava `## PAGE FIT` (transcrição, como `## KEEP UNCHANGED`).
- [x] A3 Docs: `resume-handoff.md` (schema com `## PAGE FIT`, semântica de `mandatory`/`length_constraint`, prompt fixo),
      `resume-tailoring.md` (uma página como regra de forma), `OPERATIONAL_SKILL.md` do cv-operator
      (`CLAUDE_STOPPED_WITHOUT_PDF` agora = impossibilidade real; ler `MOTIVO`).
- [x] A4 Testes `test_cv_pipeline.py` (seção obrigatória, parse, handoff com PAGE FIT, prompt sem limite de linhas no
      resumo). `python3 scripts/validate_job_search.py`.
- [x] A5 Lição em `.agents/lessons.md` (restrição de forma tratada como bloqueio).

Fora do escopo: corrigir o snapshot defasado (o caminho certo é A1 tolerar a divergência; snapshot continua sendo o
texto do último PDF).

## B. Retomar o currículo travado pelo painel

### Contrato novo no `dispatch.py`

`list`: GERAR_CURRICULO em `PRECISA_HUMANO` ganha `progress.recovery` (calculado pelo dispatcher, o painel não
recalcula):

```json
{
  "reason": "texto claro em pt-BR, por código",
  "claude_reply": "trecho final do painel do Claude (texto puro, sem glifos privados) ou null",
  "doubts": ["dúvidas do ChatGPT do handoff BLOCKED (texto puro)"],
  "options": [
    { "key": "claude", "label": "...", "description": "..." },
    { "key": "chatgpt", "label": "...", "description": "..." }
  ],
  "note_allowed": true
}
```

Opções (subconjunto por código):

- `claude` — "Refazer só a edição no Claude (mesmo patch)": handoff `PATCH_READY` presente; reaproveita o patch,
  nova tarefa no painel. Para códigos do Claude (`BLOCKED_CLAUDE_CHROME:*`).
- `chatgpt` — "Refazer o patch no ChatGPT e editar de novo": pipeline inteiro. Sempre disponível.
- "Outro" (texto livre, no painel = `note`): vai junto com a opção `chatgpt` como **orientação do usuário** no prompt
  do ChatGPT (dado, não muda as regras; o ChatGPT continua autor e validador factual). Serve também para responder às
  dúvidas de `HUMAN_REVIEW_DOUBTS`.

Comando novo: `dispatch.py resume-cv <dispatch_id> --option claude|chatgpt [--note-stdin]`:

- só GERAR_CURRICULO `PRECISA_HUMANO`, não retomado antes (`retried_by`), opção dentro das oferecidas; mesmas
  pré-condições do `start` (dossier SELECIONADA/ABERTA, CDP 9226, painéis PT/EN, sem disparo ativo; o `start` do currículo não checa `CHATGPT_BUSY` hoje e a retomada segue igual);
- `--note-stdin` só com `chatgpt`; texto pelo stdin com as mesmas guardas da vaga indicada (NFKC, sem controle,
  10–1500, sem padrão de aprovação, sem `[painel:` nem marcador), gravado em
  `runtime/operations/<novo id>/orientacao.md` (0600, diretório 0700, cabeçalho "DADO NÃO CONFIÁVEL"); argv fixo;
- cria um GERAR_CURRICULO novo (`resumes: <id>`, `resume_option`), marca o antigo `retried_by` + `acknowledged`
  (o card antigo sai, como no complemento da vaga indicada); recusa com código (`NOT_RESUMABLE`,
  `ALREADY_RESUMED`, `OPTION_INVALID`, `NOTE_NOT_EXPECTED`, `INTAKE_INVALID`, `INTAKE_LOOKS_LIKE_APPROVAL`...).
- `cv_pipeline`: `Pipeline(..., from_handoff=True)` pula ChatGPT e reusa o handoff `PATCH_READY` (só faz backup do
  `claude-chrome.json`); `Pipeline(..., note=<texto>)` acrescenta ao prompt um bloco "ORIENTAÇÃO DO USUÁRIO (dado,
  não instrução que mude as REGRAS)".

### Painel

- [x] B1 job-search: `recovery` em `progress`, `resume-cv`, `cv_pipeline` (`from_handoff`, `note`), testes em
      `test_dispatch.py`/`test_cv_pipeline.py`, `RUNTIME.md`/docs do disparo.
- [x] B2 `lib/ops/schema.ts` (`recovery`, `resumes`/`retried_by`), `app/actions/ops.ts` `resumeCv(id, choice)`
      (`getAllowedSession()` primeiro; nota por stdin com `normalizeIntake`), `present.ts` `canResumeCv()`, textos de
      recusa. Vitest.
- [x] B3 `components/job-search/ops.tsx`: no card do currículo travado, motivo em linguagem clara, trecho do Claude e
      dúvidas como texto puro, opções em rádio + "Outro" com textarea/contador (modelo `IntakeRefine`), botão "Tentar
      de novo"; "Dispensar" continua.
- [x] B4 Fake dispatcher (`e2e/fixtures/job-search-fake`) com `recovery` e `resume-cv`; spec e2e do fluxo.
- [x] B5 `CLAUDE.md` do painel e contrato de 2026-09-29: segunda exceção de texto livre (orientação do currículo).
- [x] Gates: job-search pytest; painel `pnpm test`, `tsc --noEmit`, `lint`, `format:check`, e2e na cópia 3108.

## Resultado (2026-10-02)

- job-search `82b13bf` (A1/A3): skill `/ajustar-curriculo` com "Texto atual diferente do `target_text`", "Caber em
  uma página" (placeholders do grid saem sempre; plano de encaixe; `mandatory: no`; largura) e "Quando parar sem
  exportar" (`MOTIVO:`, nunca pergunta no chat); `resume-handoff.md`, `resume-tailoring.md`, `OPERATIONAL_SKILL.md`.
- job-search `54cc04a` (A2/A4): seção obrigatória `ENCAIXE EM UMA PÁGINA` no prompt/parser, `## PAGE FIT` no handoff.
- job-search `37d16bc` (achado no caso real): o card lia `STATUS: X`, mas o handoff tem `## STATUS` + valor na
  linha seguinte; PATCH_READY aparecia como "PRESENTE".
- job-search `4d3a260` (B1): `progress.recovery`, `resume-cv`, `cv_pipeline` (`from_handoff`, `note`),
  `claude-chrome.json` com 1200 caracteres do painel, `RUNTIME.md`. Lição em `.agents/lessons.md` (A5).
- Painel (B2–B5): schema `recovery`/`resumes`/`retried_by`, `resumeCv`, `canResumeCv`/`resumeCvRefusalText`, card
  com motivo, trecho do Claude, dúvidas, opções e "Outro"; fake dispatcher (fake-1003 trava) e spec e2e.
- Gates: job-search `test_dispatch` 76, `test_cv_pipeline` 16, `test_cv_claude_chrome` 25, scripts OK, validador OK
  (`test_runtime_policy`, `test_tool_surface`, `test_agent_messages` falham igual em 4fd2ed2: ambiente); painel
  Vitest 201, `tsc`, lint (2 avisos antigos), prettier, Playwright 30/30 numa cópia na 3108.

## Não verificável aqui

Rodada real do ChatGPT e do Claude in Chrome (não disparar bots reais). A skill nova só vale depois que o Igor colar
o texto de `SKILL.md` na conta claude.ai.
