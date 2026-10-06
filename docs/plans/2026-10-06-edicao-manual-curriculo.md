# Edição manual do currículo, sem IA (2026-10-06) — viabilidade e plano

Pedido do usuário: em `/vaga/[job_id]`, abrir o texto do currículo da vaga num formato só-texto (ex.: Markdown),
mudar trechos, salvar, e o PDF sair com o mesmo layout, mudando só o conteúdo. Sem ChatGPT, sem Claude.

Atravessa os dois repositórios e a regra do painel ("nenhuma outra free text aos bots", painel sem escrita, PDF
conferido por sha256): só implementar depois do ok explícito às decisões no fim.

## Como o currículo é produzido hoje (lido no código)

- Layout e conteúdo vivem num documento do **Claude Design** (claude.ai/design), um por idioma
  (`cv_claude_chrome.DOCS` pt/en), "currículo de trabalho" editado no lugar, sem duplicar: a vaga seguinte parte do
  estado deixado pela anterior (`CV_DOC_AT_OTHER_JOB`).
- Quem edita é o Claude in Chrome com a skill `/ajustar-curriculo` (substituição de texto bloco a bloco), a partir do
  `## CLAUDE INSTRUCTIONS` do `resume-handoff.md` (autor: ChatGPT em GERAR_CURRICULO; o usuário em EDITAR_CURRICULO).
- Exportação: Share → Export → PDF → "Print or save as PDF" no Chrome em modo quiosque. O PDF é impressão do Chrome
  de HTML (`pdfinfo`: Producer `Skia/PDF`, A4; `pdffonts`: LiberationSans regular/bold).
- O host (`cv_claude_chrome.py`) detecta o PDF novo, confere 1 página e texto, renomeia para o `output_name`
  (`-vN` na edição), roda `cv_export record` e grava o `pdftotext -raw` como `runtime/resume-master-snapshot{,-en}.md`.
- `cv.json` (`cv/2`): `pdf_path`, `pdf_sha256`, `handoff_sha256`. `cv_export verify` exige PDF com o hash, handoff
  com o hash, `PATCH_READY`, `job_id` e marca editorial em `EDITORIAL_MARKS` (`CHATGPT/REQUIRED`, `USER/USER_REQUEST`,
  e a da revisão pelo ChatGPT). `dispatch.py cv-file` só devolve PDF de `cv.json` VALID.
- **Não existe fonte local estruturada do conteúdo** de uma vaga: só o PDF e o texto extraído (que perde negrito,
  colunas, links e quebras).

## Viável? Sim, mas não "editando o Claude Design sem IA"

| Caminho                                                           | Layout                           | Sem IA | Custo / risco                                                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Script edita o DOM do Claude Design por CDP e exporta          | idêntico                         | sim    | Frágil (editor não é API, a própria skill desfaz com Ctrl+Z quando o grid embaralha); mexe no documento compartilhado entre vagas. Não recomendo.  |
| B. **Template local HTML/CSS + Chrome headless `--print-to-pdf`** | réplica do layout, feita uma vez | sim    | Precisa portar o layout uma vez e conferir paridade; passa a haver dois layouts (Claude Design e local) até decidir aposentar um. **Recomendado.** |
| C. Editar o PDF direto                                            | igual                            | sim    | Texto em PDF não reflui; inviável para mudar trechos.                                                                                              |

B é viável com o que já há na máquina: o PDF atual já é Chrome imprimindo HTML, `google-chrome` está instalado e
LiberationSans é fonte do sistema. Paridade "pixel a pixel" não é garantida; paridade visual conferida pelo usuário
é.

## Fonte editável proposta

- `runtime/applications/<job_id>/cv-source.md` (0600): Markdown **restrito** com estrutura fixa — cabeçalho (nome,
  título, linha de contato), seções `## RESUMO PROFISSIONAL`, `## EXPERIÊNCIA` etc., itens com título/datas/local e
  bullets, `**negrito**`. Parser local estrito (job-search): qualquer coisa fora da gramática = `CV_SOURCE_INVALID`
  com a linha. **Nunca HTML cru**: todo texto é escapado ao entrar no template (o texto é do usuário, mas o PDF vai
  a recrutadores e o template não pode ser quebrado por `<`).
- Ponto de partida de cada vaga: a fonte da versão vigente; se a vaga ainda não tem fonte (PDF só do Claude Design),
  um bootstrap (decisão D2).

## Regenerar o PDF sem IA

- job-search `scripts/cv_render.py <job_id>`: parse → HTML do template (`templates/cv/{pt,en}.html` + CSS) → Chrome
  headless `--print-to-pdf` (sem rede, `--no-pdf-header-footer`) → confere 1 página (`pdf_pages` já existe) → nome
  `-vN` sem sobrescrever (mesma regra de `cv_edit`) → `cv_export record`.
- Contrato do `cv.json`: hoje a âncora é o `resume-handoff.md`. Para a edição manual a âncora é a fonte:
  `cv/3` com `source_kind: HANDOFF|MANUAL` e `source_sha256`, ou um handoff mínimo gerado com
  `editorial_source: USER` / `editorial_review: MANUAL` e a fonte inteira no corpo (preserva `cv/2` e o `verify`
  atual; recomendado, menor mudança). `verify` continua exigindo hash do PDF e da âncora.

## Painel (onde esbarra no CLAUDE.md)

- P1 — **sem painel**: o usuário edita `cv-source.md` no editor dele e roda `cv_render.py`; o painel só mostra o PDF
  novo pelo `cv-file` de hoje. Zero exceção nova; menos conveniente.
- P2 — **editor no painel**: textarea com a fonte (`dispatch.py cv-source <job_id>`, só leitura) e "Salvar e gerar
  PDF" (`dispatch.py manual-cv <job_id> --source-stdin`, síncrono, sem registro de disparo, sem bot, sem LLM).
  Seria a **4ª exceção de texto livre** do painel, mas de natureza diferente: o texto não vai a bot nenhum, vai a
  um renderizador determinístico. Mesmas garantias das outras: stdin (nunca argv), guardas no painel e de novo no
  job-search (NFKC, sem controle, limite de tamanho maior — ~20k code points —, parser estrito), arquivo privado,
  exibido de volta só como texto puro. O painel continua sem credencial e sem escrever na Sheet; quem grava o
  arquivo e o PDF é o job-search.
- Trade-off: P2 é o que o usuário pediu, mas amplia a superfície de entrada do painel e cria um caminho de escrita de
  conteúdo (não de Sheet). P1 entrega o mesmo resultado sem mudar a regra. Recomendo **P1 primeiro, P2 em seguida**,
  porque a parte difícil (paridade do layout) é a mesma e P1 a valida sem abrir exceção.

## Riscos e interação com o fluxo atual

- **Divergência com o Claude Design**: a versão manual não volta ao documento do Claude Design. Um EDITAR_CURRICULO
  ou GERAR_CURRICULO depois partiria de um documento sem a edição manual. Precisa de regra (D3).
- **Snapshot**: o `resume-master-snapshot` alimenta o ChatGPT da próxima vaga; atualizar ou não com a versão manual
  (D3).
- 1 página: o template não tem o "Caber em uma página" da skill; texto longo = `PDF_PAGES_2`, o usuário corta.
- Candidatura: `claude_application` e `cv_ready` usam só `cv_export verify` → funcionam com a versão manual sem
  mudança, desde que o `verify` aceite a marca nova.

## Decisões abertas (preciso do ok)

- D1. Caminho B (template local) em vez de A (automatizar o Claude Design)? Recomendo B.
- D2. Bootstrap da fonte: (a) eu porto o layout e o conteúdo da `-v2` da Enforce à mão (template + `cv-source.md`) e
  você confere lado a lado com o PDF do Claude Design; (b) primeiro verificar se o Claude Design exporta HTML
  (Share → Export), o que daria o CSS exato — não verifiquei, é a sua conta. Recomendo (b) se existir, senão (a).
- D3. Depois de uma versão manual: (a) AI (GERAR/EDITAR) recusa com `CV_MANUAL_DIVERGED` até você decidir;
  (b) avisa e segue a partir do Claude Design; (c) migrar tudo para o template local (Claude in Chrome passa a editar
  a fonte, não o Claude Design) — mudança grande, fora deste plano. Recomendo (a).
- D4. P1 só, ou P1 + P2 (4ª exceção de texto livre no painel)?
- D5. Âncora no `cv.json`: handoff mínimo `USER/MANUAL` (recomendado) ou `cv/3`.

## Itens (depois do ok)

job-search

- [ ] Template `templates/cv/pt.html` (+ en) e CSS; paridade conferida com o PDF atual (pdftotext igual,
      comparação visual `pdftoppm`) e aprovada pelo usuário
- [ ] `scripts/cv_source.py`: gramática, parser estrito, escape, testes (entrada maliciosa: `<script>`, `{{`, controle)
- [ ] `scripts/cv_render.py`: Chrome headless, 1 página, `-vN`, `record`; testes com Chrome falso
- [ ] `cv_export`: marca `USER/MANUAL` (ou `cv/3`), `verify` com testes de regressão
- [ ] Regra D3 em `dispatch.py` (GERAR/EDITAR) com teste
- [ ] Docs: `methodology/resume-handoff.md`, docstring do `dispatch.py`

painel (só com D4 = P2)

- [ ] `dispatch.py cv-source` / `manual-cv --source-stdin` + schemas zod
- [ ] `getCvSource`/`saveCvSource` em `app/actions/ops.ts` com `getAllowedSession()`
- [ ] Editor na seção Currículo, texto puro, guardas espelhadas, textos de recusa
- [ ] Unit + E2E com o dispatcher falso; atualizar CLAUDE.md (4ª exceção)
