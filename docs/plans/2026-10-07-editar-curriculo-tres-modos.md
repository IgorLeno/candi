# "Editar currículo" em três modos no renderer local (2026-10-07) — desenho para aprovação

Pedido do usuário (2026-10-07): no renderer `local` (plano `2026-10-07-curriculo-sem-claude-design.md`), a chave
"Revisar o pedido no ChatGPT antes" sai (a revisão já é obrigatória, D3a) e "Pedir edição" vira **"Editar currículo"**
com três modos:

1. **Revisão pelo ChatGPT, sem comentário do usuário**: segunda avaliação do currículo da vaga com todo o contexto
   (vaga, análise, `knowledge/`, `cv-doc` da vaga); ajustes em `cv-patch`, aprovados item a item (✓/✗) pelo usuário.
   Sem ajuste = "sem mudanças", nada muda.
2. **Edição com os comentários do usuário**: o fluxo `local` de hoje (texto pela stdin → ChatGPT → `cv-patch`), agora
   também com aprovação item a item antes do render (E1).
3. **Edição manual**: um campo por id do `cv-doc`, só nos não travados; o job-search valida, aplica, encaixa e
   renderiza. Sem IA. É a 4ª exceção de texto livre do painel, mas vai a um renderer determinístico, não a um bot.

Com `claude_design` nada muda no painel nem no job-search (caminho a aposentar). Os três modos só existem no `local`;
no `claude_design` o job-search recusa `CV_LOCAL_ONLY`.

Regra central mantida: job-search é a autoridade. O painel mostra o que o `list`/`cv-doc` devolvem e só faz gating de
UX; quem valida, aplica, mede e grava é o job-search. O painel continua sem escrever na Sheet (nada disto toca a Sheet).

## Estado de partida (lido no código em 2026-10-07)

- `dispatch.py start EDITAR_CURRICULO --platform hermes --job-id ID --request-stdin`: no `local`, `chatgpt_review` é
  forçado; `_cvedit` → `cv_edit.review_local` (pedido → `cv_local.negotiate` → `outcome` → `fit_doc` → `export` `-vN`
  → `cv.json` cv/3) em um passo, **sem parada para aprovação**. Etapas no `list`: `pedido` → `chatgpt` → `claude`
  ("PDF no template local (host)") → `cv`.
- `cv_patch.check` exige ao menos um CHANGE (`PATCH_NO_CHANGES`); `cv_patch.fit` aplica todos os CHANGEs, depois os
  cortes de ENCAIXE e omite `mandatory: no` em ordem inversa (D4a).
- `cv_doc.apply` é puro: aplicar um subconjunto e ver se quebra (path/`expect` dependentes) não precisa de Chrome.
- `cv_export.EDITORIAL_MARKS`: `CHATGPT/REQUIRED`, `USER/USER_REQUEST`, `USER/CHATGPT_REVIEW`.
- O painel chama o dispatcher com timeout de 30 s (`lib/ops/dispatcher.ts`); o encaixe re-renderiza no Chrome a cada
  passo, então **render nunca é síncrono no comando**: sempre num filho do host, com card e polling.

## Contrato novo do `dispatch.py` (argv fixo, texto só pela stdin)

| Comando                                                                | Modo  | Entrada variável                                        | Síncrono?                             |
| ---------------------------------------------------------------------- | ----- | ------------------------------------------------------- | ------------------------------------- |
| `start EDITAR_CURRICULO --platform hermes --job-id ID --reassess`      | 1     | só `job_id` (flag fixa, sem valor)                      | não: filho `_cvedit`                  |
| `start EDITAR_CURRICULO --platform hermes --job-id ID --request-stdin` | 2     | pedido pela stdin (guardas de hoje)                     | não: filho `_cvedit`                  |
| `apply-cv-changes <dispatch_id> --approve <n,n,…\|none>`               | 1 e 2 | só números de CHANGE (`^\d{1,2}(,\d{1,2})*$` ou `none`) | valida já; render no filho `_cvapply` |
| `cv-doc <job_id>`                                                      | 3     | só `job_id`                                             | sim, só leitura                       |
| `start EDITAR_CURRICULO --platform hermes --job-id ID --manual-stdin`  | 3     | JSON das edições pela stdin                             | valida já; render no filho `_cvedit`  |

`--reassess`, `--request-stdin` e `--manual-stdin` são mutuamente exclusivos (`EDIT_MODE_INVALID`). `--chatgpt-review`
continua aceito (é o caminho `claude_design`); no `local` ele é redundante. Grok: `CV_LOCAL_HERMES_ONLY` (D5).

### Estados do disparo (registro `dispatch/1`, sem status novo)

```
modo 1/2:  PENDENTE → RODANDO(stage revisao|chatgpt[, repair]) ─┬→ CONCLUIDO code NO_CHANGES        (nada muda)
                                                                ├→ PRECISA_HUMANO code HUMAN_REVIEW_DOUBTS | FORMAT_INVALID
                                                                └→ PRECISA_HUMANO code CHANGES_PENDING (stage aprovacao)
           apply-cv-changes --approve none            → CONCLUIDO code ALL_REJECTED                (nada muda)
           apply-cv-changes --approve 1,3             → RODANDO(stage render, verify) → CONCLUIDO marker PATCH_READY
                                                                                     └→ PRECISA_HUMANO PAGE_OVERFLOW:<n>
modo 3:    (start valida) PENDENTE → RODANDO(stage render, verify) → CONCLUIDO | PRECISA_HUMANO PAGE_OVERFLOW:<n>
```

`CHANGES_PENDING` reaproveita `PRECISA_HUMANO` (o painel já mantém esses cards na tela). `NO_CHANGES` e
`ALL_REJECTED` são `CONCLUIDO` sem PDF novo. `_uses_chatgpt` (CHATGPT_BUSY) vale para os modos 1 e 2, não para o 3.
`CV_JOB_BUSY` continua valendo para `RODANDO`; uma proposta em `CHANGES_PENDING` não trava a vaga (ver "Proposta
velha").

### Proposta guardada no op_dir (`proposta.json`, 0600, `cv-proposal/1`)

Gravada pelo `_cvedit` quando a resposta passa no `cv_patch.check`; o `list` só a lê (não re-parseia a resposta):

```json
{
  "schema": "cv-proposal/1",
  "job_id": "...",
  "mode": "reassess|request",
  "doc_sha256": "<cv-doc.json da vaga>",
  "free_px": 61.4,
  "changes": [
    {
      "n": 1,
      "op": "REPLACE",
      "path": "summary/text",
      "section": "Resumo profissional",
      "before": "...",
      "after": "...",
      "reason": "...",
      "evidence_source": "...",
      "mandatory": true,
      "requires": []
    }
  ],
  "cuts": [
    {
      "n": 4,
      "op": "REMOVE",
      "path": "projects/grimperium/bullets/b3",
      "section": "...",
      "before": "...",
      "after": null,
      "reason": "...",
      "requires": [2]
    }
  ]
}
```

- `before` = texto atual do path (de `cv_doc.paths`, não o `expect` do ChatGPT); `after` = texto novo, ou os
  subcampos do DUPLICATE em linhas `title=`/`bullets=`; `null` em REMOVE; em MOVE_AFTER, "depois de <anchor>".
- `requires` (calculado no host, sem Chrome): para cada CHANGE `j`, aplicar todos menos `j` com `cv_doc.apply`; os
  que passam a falhar dependem de `j`. O painel usa `requires` só para desabilitar o ✓ de quem depende de um ✗ (UX);
  o job-search confere de novo no `apply-cv-changes`.
- Limites: até 30 itens; textos cortados em 900 code points (o `cv_doc.MAX_LEN` maior). Texto do ChatGPT = dado não
  confiável, exibido como texto puro.

### `apply-cv-changes <id> --approve …` (síncrono até a validação)

Recusas, nesta ordem: `DISPATCH_ID_INVALID`; `CHANGES_NOT_PENDING` (o disparo não está em `CHANGES_PENDING`, já foi
aplicado ou retomado); `APPROVAL_INVALID` (número fora da proposta, repetido ou formato); `CV_DOC_CHANGED` (o
`cv-doc.json` da vaga não tem mais o `doc_sha256` da proposta: outra geração/edição passou por ela, peça de novo);
`CV_JOB_BUSY`; `CHANGES_DEPEND:<n>` (o subconjunto aprovado não se aplica: o CHANGE `n` depende de um rejeitado;
`cv_patch.check` sobre o subconjunto, cortes inclusive). Passou: grava `approved` no registro, volta para `RODANDO`
(stage `render`) e solta o filho `_cvapply`, que encaixa (D4a só com os aprovados: os cortes aprovados, na ordem; depois
omite aprovados `mandatory: no`, do último para o primeiro, e lista em `progress.fit.omitted`), renderiza `-vN`, grava
`cv-doc.json`/handoff/`cv.json` e roda `verify`. `--approve none` fecha com `ALL_REJECTED`, sem filho.

### Prompt fixo da revisão (modo 1, `cv_edit.REASSESS_PROMPT`)

Mesmo bloco de contexto do GERAR local (`cv_pipeline._PROMPT_HEAD`: VAGA com o `posting.md`, ANÁLISE CANÔNICA do
dossier, EVIDÊNCIAS de `knowledge/`), com o currículo **da vaga** endereçado (`cv_local.addressed(cv-doc)`) no lugar da
base e a folga medida. Rascunho:

> Este é o currículo do Igor já feito para a vaga abaixo (o host aplicou um patch seu sobre a base fixa). Faça uma
> **segunda avaliação independente**, como se lesse pela primeira vez: aderência à vaga, fatos contra as EVIDÊNCIAS,
> ênfase e ordem. Proponha só ajustes que melhorem de fato; não reescreva por estilo. Se o currículo já está bom,
> responda `PATCH`, a linha `SEM MUDANÇAS` e as seções finais (é uma resposta válida e esperada). Cada ajuste é um
> CHANGE no formato abaixo; o Igor aprova ou rejeita cada um, então cada CHANGE precisa ser independente sempre que
> possível e o `reason` precisa dizer em uma frase por que ele muda o que você propôs antes. Folga atual da página:
> ≈ {linhas} linha(s).

Seguem `cv_local.RULES_AND_FORMAT` (regras de fato, travas, formato `cv-patch`, ENCAIXE, DÚVIDAS). Parser: `SEM
MUDANÇAS` logo depois de `PATCH` e zero CHANGE = `NO_CHANGES`; zero CHANGE sem a linha = erro de formato (rodada de
REPAIR, como hoje). O modo 2 continua com `cv_edit.local_review_prompt` mais a frase da independência dos CHANGEs.

### Edição manual (modo 3)

`cv-doc <job_id>` → `{job_id, lang, doc_sha256, filename, sections: [{id, title, fields: [{path, label, text, kind:
paragraph|bullet|field, max, locked}]}]}`. Exige o mesmo que o modo 2 (`check_local`: cv/3 VALID + `cv-doc.json`; senão
`CV_NOT_READY`/`CV_DOC_MISSING`/`CV_DOC_INVALID`). `max` = `cv_doc.MAX_LEN[kind]`; o painel não recalcula.

`--manual-stdin` recebe `{"doc_sha256": "…", "edits": [{"path": "…", "text": "…"}]}` (até 24 KB). Só **REPLACE de
campos existentes** (sem inserir, remover nem mover: isso continua com os modos 1 e 2). Recusas: `MANUAL_INVALID`
(JSON, forma, path repetido), `CV_DOC_CHANGED`, `MANUAL_PATH_MISSING:<path>`, `MANUAL_PATH_LOCKED:<path>`,
`MANUAL_TEXT_<EMPTY|CONTROL|MARKUP|TOO_LONG|LOOKS_LIKE_APPROVAL>:<path>` (NFKC + `cv_doc.text_errors` + o padrão de
aprovação e `[painel:`/marcador, como a indicação), `MANUAL_NO_CHANGES` (todos iguais ao atual). Passou: grava
`edicao-manual.json` (0600) no op_dir e o filho aplica (`cv_doc.apply` com REPLACE, `expect` = texto atual), mede; não
coube = `PAGE_OVERFLOW:<n>` sem cortes automáticos (não há ENCAIXE do usuário), o PDF não muda; coube = render `-vN`.

Sem conferência factual automática no modo 3 (como a opção B de 2026-10-03: o texto é do próprio usuário, autoridade
dos fatos dele); as travas impedem mexer em nome, contato, datas, instituições, cargos, certificações e idiomas.

### Marcas editoriais e `cv_export`

| Modo | `editorial_source` / `editorial_review` | Extra no handoff                    |
| ---- | --------------------------------------- | ----------------------------------- |
| 1    | `CHATGPT` / `USER_APPROVED` (nova)      | `edit_of`, `approved_changes: 1,3`  |
| 2    | `USER` / `CHATGPT_REVIEW` (já existe)   | `edit_of`, `approved_changes: …`    |
| 3    | `USER` / `MANUAL` (nova, já prevista)   | `edit_of`, lista dos paths editados |

`EDITORIAL_MARKS` ganha as duas; `verify` com testes de regressão (cv/2 e cv/3 antigos continuam VALID).

### Proposta velha

Uma proposta em `CHANGES_PENDING` não trava a vaga. Se depois dela a vaga gerar ou editar de novo, o `doc_sha256`
muda e `apply-cv-changes` recusa `CV_DOC_CHANGED` (o card diz "o currículo mudou depois desta proposta: peça de
novo"). Um disparo novo de edição da mesma vaga marca a proposta pendente anterior como `superseded_by` (sai da tela,
como `retried_by`).

## Painel (só com `cv_renderer == "local"`; com `claude_design` nada muda)

- **Schema**: `listResultSchema.cv_renderer: "claude_design" | "local" | "INVALID"` (opcional, ausente = trata como
  `claude_design`); `dispatchSchema.renderer` opcional; `progress.proposal` (o `proposta.json`, zod estrito nos
  limites acima), `progress.fit` (`free_px`, `cuts`, `omitted`), `progress.edit_mode`; `cvDocSchema` do `cv-doc`.
- **Server actions** (`app/actions/ops.ts`, todas com `getAllowedSession()` primeiro): `reassessCv(jobId)`,
  `editCv(jobId, {text})` (no local sem `platform`/`chatgptReview`), `applyCvChanges(dispatchId, approved: number[])`,
  `getCvDoc(jobId)`, `saveCvManual(jobId, {docSha256, edits})` (guardas espelhadas em `lib/ops/cv-manual.ts`: NFKC, sem
  controle, sem `<`/`>`, `max` do job-search, sem padrão de aprovação; vai pela stdin).
- **Seção Currículo** (`JobCvOps`): "Editar currículo" com três abas: **Revisão do ChatGPT** (descrição + botão
  "Pedir segunda avaliação"), **Com seus comentários** (textarea de hoje, sem a chave), **Manual** (carrega o `cv-doc`;
  um campo por path editável agrupado por seção, travados como texto cinza com cadeado; contador `n/max`; "Salvar e
  gerar PDF" só com mudança e sem erro). Sem `PlatformToggle` no currículo (Hermes fixo, E2). Sem "Abrir
  navegador do currículo".
- **Aprovação** (no `DispatchCard` em `CHANGES_PENDING`): lista das mudanças, cada linha com seção, "antes" riscado →
  "depois", motivo e dois botões de alternância **✓ Aprovar** / **✗ Rejeitar** (`aria-pressed`, cor + ícone + rótulo);
  item que `requires` um rejeitado fica desabilitado com "depende da mudança n". Grupo separado "Cortes se não couber
  em uma página" com os mesmos botões. Rodapé: "Aplicar N aprovadas" (habilitado só com todas decididas e ao menos uma
  ✓), "Rejeitar todas"; atalhos "Aprovar todas"/"Rejeitar todas" no topo. Depois do render, o card lista o que o
  encaixe omitiu.
- **Textos**: `cvEditStopText` no local sem citar o Claude (`PAGE_OVERFLOW:<n>` com as linhas, `CHROME_NOT_QUALIFIED`,
  `CV_DOC_CHANGED`, código genérico do template local); `refusalText` para `CV_LOCAL_ONLY`, `CV_LOCAL_HERMES_ONLY`,
  `CV_JOB_BUSY`, `CV_DOC_MISSING`, `CV_DOC_INVALID`, `CV_DOC_CHANGED`, `CV_BASE_MISSING`, `CV_RENDERER_INVALID`,
  `CHROME_NOT_QUALIFIED`, `CHROME_MISSING`, `CHANGES_NOT_PENDING`, `CHANGES_DEPEND`, `APPROVAL_INVALID`,
  `EDIT_MODE_INVALID`, `MANUAL_*`; card `NO_CHANGES` = "o ChatGPT não viu nada a ajustar: currículo sem mudanças".
- **Aviso `INVALID`**: faixa na seção Currículo "a chave do renderer do currículo está inválida no job-search: gerar e
  editar ficam recusados até corrigir" (E3). Toast `CLOUDDESIGN_CDP_DOWN` sem mudança (o código não chega no
  local).
- **CLAUDE.md**: reescrever o parágrafo "option B / switch de 2026-10-05" para valer só no `claude_design`; no `local`:
  três modos, a aprovação item a item (só ids pelo argv), e a 4ª exceção (edição manual, stdin, renderer
  determinístico).

## Decisões (usuário, 2026-10-07)

- E1. Aprovação ✓/✗ item a item também no modo 2 (com comentários): **sim**, mesmo card dos dois modos.
- E2. Com o `local`, o seletor de plataforma sai da seção Currículo: **Hermes fixo**.
- E3. Faixa de aviso na seção Currículo quando a chave vier `INVALID`: **sim**.
- E4. Encaixe com aprovação: **omitir aprovadas `mandatory: no`** (do fim para o começo, depois dos cortes aprovados)
  e mostrar no card o que foi omitido (D4a de hoje).
- E5. Edição manual só troca texto de campos existentes (sem inserir, remover nem mover) nesta etapa: proposto no
  desenho e não contestado; reabrir se o uso pedir.

## Itens

job-search (commits pequenos, com testes)

- [ ] `cv_patch`: `SEM MUDANÇAS` (zero CHANGE válido só com a linha), `requires` por CHANGE, check de subconjunto
- [ ] `cv_edit`: `propose_local` (modos 1 e 2 param em `CHANGES_PENDING` com `proposta.json`), `REASSESS_PROMPT`,
      `apply_approved`, `manual_local`; marcas `CHATGPT/USER_APPROVED` e `USER/MANUAL` em `cv_export` + `verify`
- [ ] `dispatch.py`: `--reassess`, `--manual-stdin`, `apply-cv-changes`, `cv-doc`, filho `_cvapply`, `progress`
      (`proposal`, `fit`, `edit_mode`, etapas por modo), `superseded_by`, `CV_LOCAL_ONLY`; docstring
- [ ] Testes: `test_cv_patch`, `test_cv_edit`, `test_dispatch` (estados, recusas, dependência, doc mudou, stdin)
- [ ] Docs: `methodology/resume-handoff.md` (marcas, proposta, manual), `resume-tailoring.md`

painel

- [ ] `schema.ts` (`cv_renderer`, `renderer`, `proposal`, `fit`, `cvDocSchema`) + testes
- [ ] `app/actions/ops.ts` (`reassessCv`, `applyCvChanges`, `getCvDoc`, `saveCvManual`, `editCv` local) +
      `lib/ops/cv-manual.ts` com testes
- [ ] `present.ts`: textos de recusa, `cvEditStopText` local, `canApplyChanges()` (UX)
- [ ] `ops.tsx`: abas do "Editar currículo", card de aprovação, formulário manual, esconder Claude Design e plataforma
      no local, faixa `INVALID`
- [ ] Fake do E2E (`e2e/fixtures/job-search-fake`): lê `$STATE/cv-renderer`, os comandos novos; `e2e/ops.spec.ts`
- [ ] CLAUDE.md do painel; plano `2026-10-07-curriculo-sem-claude-design.md` (Andamento/Itens)
- [ ] Gates: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm format:check`; E2E só sem servidor real na 3000
