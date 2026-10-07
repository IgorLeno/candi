# Currículo sem Claude Design e sem Claude in Chrome (2026-10-07) — viabilidade e plano

Pedido do usuário: gerar e editar os currículos sem o Claude Design e sem o Claude in Chrome, com **o mesmo layout**
(requisito inegociável). O trabalho de hoje é "de parser": trocar trechos, duplicar itens, criar tópicos. Ideia:
template pronto + um aplicador determinístico das mudanças propostas pelo ChatGPT, endereçando cada tópico com
precisão. Ganhos: sem uso do Claude Design/Claude in Chrome e tudo no fluxo painel → job-search.

Amplia e substitui a opção D3(c) do plano `2026-10-06-edicao-manual-curriculo.md` (ver "Relação com a edição manual").
Atravessa os dois repositórios e mexe em GERAR_CURRICULO e EDITAR_CURRICULO: decisões aprovadas em 2026-10-07 (ver
"Decisões").

## Resultado da investigação (protótipo descartável no scratchpad, fora dos repositórios)

Fonte: o usuário exportou o projeto do Claude Design (`CURRÍCULOS.zip`: `Currículo Igor Fernandes.dc.html`,
`doc-page.js`, `support.js`, `export/…source.html` mais antigo). O `.dc.html` é o documento de trabalho PT no estado
da `-v2` da Enforce.

O que o HTML mostra:

- Layout = um `<section class="page">` A4 com estilos **inline** (flex/grid, Arial, tamanhos 27/13/12/11.8/11.6/11.5/
  11.4 px, cores #0E5B54, #12202A, #283945…). Arial cai em LiberationSans (métrica idêntica): é a fonte do PDF.
- Conteúdo misturado: parte literal no HTML, parte por binding `{{ t.x }}` de dicionários PT/EN no `<script>`, vários
  valores mortos (`summaryBody`, `exp1..3`, `grim1..2`, `ic`, `tcc` não usados). O ramo EN do mesmo arquivo está
  desatualizado; o currículo EN real vive no outro documento (`DOCS.en`), que **não** veio no zip.
- `support.js` é o runtime do Claude Design (baixa React e Babel do unpkg); `doc-page.js` é o shell de página. Do
  `doc-page.js` só importam três coisas: página A4 sem margem, `overflow: hidden` na página e os padrões
  `text-wrap: balance` (títulos) / `text-wrap: pretty` (p, li). O `pretty` explica a quebra "cedo" do 1º bullet do
  CPQBA e do 1º do Grimperium: não é ajuste manual de largura.
- `<strong>UNESP</strong>` pede `Source Serif 4`, mas o PDF real sai em LiberationSans Bold (a web font não é usada na
  impressão). O template fixa o que o PDF mostra.
- **A página corta o excesso em silêncio** (`overflow: hidden`): um currículo que não cabe continua saindo com
  `Pages: 1`. O teste de página única de hoje (`cv_claude_chrome.pdf_pages == 1`) não detecta texto cortado; quem
  detecta hoje é o Claude olhando a tela.

Protótipo: script converte o `.dc.html` em HTML estático (resolve `sc-if`/`{{ t.* }}`, troca `style-before` por CSS,
remove `support.js`, Google Fonts e `doc-page.js`, põe ~6 linhas de CSS próprio: `@page A4 margin 0`, página
210×297 mm com `overflow: hidden`, o deslocamento −8/−22 px que o documento já tem, e os dois `text-wrap`).
Render: `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf` (Chrome 154, o mesmo do PDF real).

Paridade medida contra `curriculo_igor-fernandes_pt_enforce-grupo-btg-pactual-v2.pdf`:

| Critério                                              | Resultado                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `pdfinfo` (A4 594.96×841.92, 1 página, Skia/PDF m154) | igual                                                               |
| `pdffonts`                                            | igual (LiberationSans regular + 2 subsets bold)                     |
| `pdftotext -raw`                                      | **idêntico**                                                        |
| `pdftotext -layout`                                   | idêntico, exceto uma linha em branco                                |
| caixas de linha (`-bbox-layout`, 45 linhas)           | 45/45, mesmas quebras; x idêntico (≤ 0,02 px); 6 linhas 1 px abaixo |
| stream do PDF (fonte, tamanho, cor, posição)          | igual exceto o baseline dessas 6 linhas (+1 px)                     |
| `compare -metric AE -fuzz 10%` a 150 dpi              | 0,28% dos pixels (só as 6 linhas: 2 de contato, 4 títulos de seção) |
| aprovação visual do usuário                           | **aprovada** (D1, 2026-10-07)                                       |

O +1 px é arredondamento do baseline (posição fracionária dentro do editor); não some com deslocamentos sub-pixel
nem carregando as web fonts. 1 px a 96 dpi = 0,26 mm. Medição da folga também prototipada: o render informa
`free_px` = 154 no -v2 (≈ 9 linhas de corpo, bate com "cerca de 10 linhas" da skill) e `overflow: true` num caso
forçado, que mesmo assim sai com `Pages: 1`.

### Paridade EN (2026-10-07)

Fonte: o usuário exportou o documento EN (`RESUMES.zip`, mesmo nome de arquivo `Currículo Igor Fernandes.dc.html`;
`support.js`, `doc-page.js` e `export/…source.html` idênticos aos do zip PT). Estado do documento = o PDF
`resume_igor-fernandes_en_hatch.pdf` (2026-09-22, Chrome 153), o mesmo de `runtime/resume-master-snapshot-en.md`. O
ramo impresso é o padrão do documento: sem `language`, `isPt` fica verdadeiro, e esse ramo traz o cabeçalho EN do
Hatch; o ramo `isEn` e o dicionário `EN` estão desatualizados (são do Griffith). Quase todo o conteúdo é literal.

Diferenças do documento EN em relação ao PT, que o template precisa carregar por idioma:

- `<doc-page>` sem o deslocamento −8/−22 px que o PT tem: as margens efetivas dos dois idiomas diferem em 8/22 px;
- rótulo de competência em `#5B6C77` (no PT, `#283945`); linha da organização do CPQBA sem `<strong>`;
- `&nbsp;` antes do ano em três certificações; FORMAÇÃO com dois bullets (IC e TCC), ambos `margin-bottom: 0`.

Mesmo CSS próprio do PT (`@page`, página A4 com `overflow: hidden`, os dois `text-wrap`), só com deslocamento 0. O
mesmo gerador reproduz o PT aprovado com stream de desenho idêntico.

| Critério                                   | Resultado                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pdfinfo` / `pdffonts`                     | A4, 1 página; mesmas fontes (LiberationSans + 2 subsets bold); Skia m154 contra m153   |
| `pdftotext -raw`                           | **idêntico**                                                                           |
| `pdftotext -layout` (sem linhas em branco) | **idêntico**                                                                           |
| caixas de linha (52 linhas)                | 52/52, mesmas quebras; Δx = 0; 9 linhas 1 px abaixo (2 de contato, 7 títulos de seção) |
| `compare -metric AE -fuzz 10%` a 150 dpi   | 0,33% dos pixels (só essas 9 linhas)                                                   |
| aprovação visual do usuário                | **aprovada** (D1, 2026-10-07)                                                          |

O +1 px aparece também sem deslocamento e com o Chrome 153 na referência: é o mesmo arredondamento de baseline do PT.

**Conclusão: viável com o layout exato.** O layout passa a ser um template versionado no job-search, derivado do HTML
do próprio Claude Design, não uma réplica feita a olho.

### Critério objetivo de "mesmo layout" (gate de migração e teste de regressão)

1. `pdftotext -raw` idêntico e `pdftotext -layout` idêntico ignorando linhas em branco;
2. caixas de linha: mesmo número de linhas, mesmo texto por linha, |Δx| ≤ 0,5 px e |Δy| ≤ 1 px;
3. `compare -metric AE -fuzz 10%` a 150 dpi ≤ 0,5% dos pixels;
4. mesmas fontes (`pdffonts`) e A4;
5. aprovação visual do usuário (PT e EN), uma vez por idioma e a cada mudança de template.

1–4 viram teste automatizado (fixture: o PDF de referência + o documento estruturado equivalente).

## Modelo de documento estruturado (`cv-doc/1`)

Um JSON por currículo; os ids são estáveis e são o endereço que o patch usa.

```json
{
  "schema": "cv-doc/1", "lang": "pt", "template": "classic-1",
  "header": {"name": "...", "headline": "...", "location": "...", "contact": "..."},
  "sections": [
    {"id": "summary", "kind": "paragraph", "title": "Resumo profissional", "text": "..."},
    {"id": "experience", "kind": "entries", "title": "Experiência", "items": [
      {"id": "cpqba", "title": "Estagiário de Engenharia Química", "date": "jun 2026 — jul 2026",
       "org": {"strong": "CPQBA / UNICAMP", "rest": "Centro Pluridisciplinar ... · Campinas, SP"},
       "bullets": [{"id": "b1", "text": "..."}, {"id": "b2", "text": "..."}]}]},
    {"id": "projects", "kind": "entries", "title": "Projetos de dados, automação e IA", "items": [
      {"id": "grimperium", "title": "...", "link": {"href": "https://github.com/...", "text": "github.com/..."},
       "bullets": [...]}]},
    {"id": "education", "kind": "entries", "...": "..."},
    {"id": "skills", "kind": "pairs", "title": "Competências técnicas", "rows": [{"id": "r1", "label": "...", "text": "..."}]},
    {"id": "certifications", "kind": "lines", "column": "left", "lines": [{"id": "l1", "text": "..."}]},
    {"id": "languages", "kind": "lines", "column": "right", "lines": [...]}
  ]
}
```

- Texto puro em todos os campos (sem HTML, sem Markdown); o renderer escapa tudo. Link só `https://` de domínios
  permitidos (github.com, linkedin.com), validado.
- Campo **travado** = o que as REGRAS já proíbem mudar: `header.name`, `header.contact`, `date`, `org`, título do item
  de FORMAÇÃO, `certifications`, `languages`. Patch que toca campo travado = inválido (hoje é só regra no prompt).
- Ids novos são dados pelo host (`b3`, `grimperium-2`…), nunca pelo ChatGPT.
- Base de cada idioma: `runtime/cv-base-{pt,en}.json`, **fixa** (decisão do usuário, 2026-10-07, no passo 3): cada
  vaga parte dela e nenhuma exportação a altera (sem deriva de uma vaga para a outra; promover uma vaga a base, se
  um dia for preciso, é comando explícito). Cada vaga guarda o seu `runtime/applications/<job_id>/cv-doc.json`.
- Bootstrap: importador determinístico do `.dc.html` (PT agora; EN quando o usuário exportar o outro documento) →
  `cv-base-pt.json`, conferido pelo critério acima.

## Formato de patch determinístico (`cv-patch`, evolução do CHANGE)

O ChatGPT continua autor editorial e validador factual; muda só o endereçamento. O prompt mostra o currículo-base como
lista endereçada (`experience/cpqba/bullets/b1: Operei HPLC ...`) em vez do texto do `pdftotext`.

```
CHANGE 1
op: REPLACE | INSERT_AFTER | INSERT_BEFORE | DUPLICATE | REMOVE | MOVE_AFTER
path: experience/cpqba/bullets/b1
expect: <texto atual exato do path; "nenhum" em INSERT/DUPLICATE de item vazio>
text: <texto novo; em REMOVE/MOVE, "nenhum">
anchor: <path de destino, só em MOVE_AFTER>
reason / evidence_source / mandatory: yes | no
```

`DUPLICATE` copia um item inteiro (projeto, item de formação, linha de competência) para depois do original, com os
campos que o CHANGE trouxer (`text` por subcampo: `title=`, `link=`, `bullets=`), cobrindo o "duplicar e preencher"
da skill. Seções finais (KEEP UNCHANGED, NÃO ADICIONAR, ENCAIXE EM UMA PÁGINA, DÚVIDAS) ficam como estão.

Validação no host (determinística, antes de aplicar; o que falhar vai para a rodada de FORMAT_REPAIR que já existe):

- `path` existe; `expect` é igual (espaços normalizados) ao texto atual do path, que substitui o `target_text`
  conferido no snapshot, agora sem ambiguidade de trecho repetido;
- `op` compatível com o tipo do path; campo travado = erro; limites de estrutura (4 categorias, 2 projetos, 2 itens em
  FORMAÇÃO, 3 bullets por bloco) checados no documento resultante;
- texto: NFKC, sem caractere de controle, sem `<`/`>` de marcação, tamanho máximo por campo;
- contra `knowledge/`: só o que é checável sem LLM: todo número/ano novo no texto precisa existir em `knowledge/` ou
  no documento-base; "Engenheiro Químico" isolado é recusado; título de item novo em projetos/formação precisa
  existir em `experience.json`/`knowledge/` (projeto, TCC, IC). O resto da conferência factual continua do ChatGPT,
  como hoje (não prometo validação semântica determinística).

Aplicação: `cv_doc.apply(base, patch) → doc` puro, testável, sem rede. Mesma entrada = mesmo documento = mesmo HTML.

### Regra de uma página

Medida no render, nunca adivinhada: o renderer abre o HTML no Chrome headless (mídia `print`, via CDP) e lê a folga
da página (`free_px`, `overflow`), além de `pdfinfo` = 1 página. Decisão D4:

- (a) **recomendado**: o host aplica os CHANGEs; se estourar, aplica a seção ENCAIXE EM UMA PÁGINA (só cortes/
  encurtamentos com texto exato dado pelo ChatGPT, também como CHANGEs endereçados) e depois omite `mandatory: no` na
  ordem inversa, re-renderizando a cada passo (é o "Caber em uma página" da skill, passos 2–3, agora determinístico).
  Ainda estourou: PRECISA_HUMANO `PAGE_OVERFLOW` com quantas linhas faltam. O passo 4 da skill (mexer em larguras)
  some: o template é fixo, é o requisito.
- (b) uma rodada extra no ChatGPT com "faltam N px (≈ k linhas)" antes de parar.
- (c) só medir e falhar; o usuário corta.

## O que muda em cada parte

| Parte                                       | Hoje                                                                                              | Depois                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GERAR_CURRICULO (`cv_pipeline`)             | packet → ChatGPT → parse → handoff → Claude in Chrome → verify                                    | packet (base endereçada) → ChatGPT → parse/validate `cv-patch` → apply → render/fit → `record` → verify. Etapa `claude` vira `render` (segundos).                    |
| EDITAR_CURRICULO com revisão do ChatGPT     | pedido → ChatGPT → patch texto → Claude                                                           | pedido → ChatGPT → `cv-patch` → apply/render. Sem mudança no painel.                                                                                                 |
| EDITAR_CURRICULO opção B (direto ao Claude) | texto livre interpretado pelo Claude                                                              | **não tem aplicador determinístico para texto livre.** D3: vira revisão obrigatória pelo ChatGPT, ou dá lugar à edição manual estruturada.                           |
| `cv_export`                                 | `cv/2`: PDF + handoff por sha256                                                                  | `cv/3`: + `doc_sha256` (o `cv-doc.json` da vaga) e `template_sha256`; `verify` exige os quatro. Marcas editoriais iguais; nova `USER/MANUAL` só com a edição manual. |
| snapshot `resume-master-snapshot*.md`       | `pdftotext -raw` do último PDF; cabeçalho `job_id`                                                | gerado do `cv-doc` (texto exato, com ids); mantido só para compatibilidade e auditoria. A base real passa a ser `cv-base-{pt,en}.json`.                              |
| `CV_DOC_AT_OTHER_JOB` / `CV_DOC_BUSY`       | documento único por idioma, estado compartilhado entre vagas                                      | somem: cada vaga tem seu documento. Fica só a trava por vaga (uma geração/edição por vez).                                                                           |
| Grok / CV Operator                          | cola comando que roda `cv_claude_chrome.py`                                                       | não precisa mais de agente: tudo roda no host. Proposta: currículo só Hermes/host; Grok sai deste fluxo (D5).                                                        |
| painel                                      | "Abrir navegador do currículo", toast `CLOUDDESIGN_CDP_DOWN`, recusa por painel do Claude fechado | removidos depois do corte. Preview do PDF, `cv-file` e sha256 inalterados.                                                                                           |

Aposentar depois do corte (não antes): `cv_claude_chrome.py`, `dispatch.py open-browser clouddesign`,
`probe.clouddesign`/`claude_panels`, `grok-bot/cv-operator/ajustar-curriculo` e a skill da conta, os códigos
`CLOUDDESIGN_*` e `openCvBrowser` no painel. O `open-browser application` (candidatura) fica.

## Migração e rollback

1. **Paridade** (PT e EN medidos no protótipo e aprovados) e aprovação visual do usuário.
2. Template + renderer + importador no job-search, com o teste de paridade. Nada do fluxo muda.
3. Chave `JSB_CV_RENDERER=claude_design|local` (padrão `claude_design`). Com `local`, GERAR/EDITAR usam o caminho
   novo; o Claude Design fica intocado.
4. Uso real em algumas vagas com `local`, conferindo cada PDF; então o padrão vira `local`.
5. Depois de N vagas sem incidente e com o ok do usuário: aposentar o código do Claude Design (lista acima).

Rollback: voltar a chave para `claude_design`. Atenção: o documento do Claude Design fica parado no estado da última
vaga feita por ele; as vagas feitas com `local` não voltam para lá. Na volta, o `CV_DOC_AT_OTHER_JOB` atual já
recusa editar uma vaga feita com `local`; uma geração nova parte do documento antigo (mesmo comportamento de hoje
quando outra vaga editou sem exportar). Os PDFs e `cv.json` já registrados continuam válidos.

## Relação com a edição manual (plano 2026-10-06) e com o CLAUDE.md do painel

- O mesmo `cv-doc.json` é a "fonte editável" que aquele plano propunha em Markdown: D3(c) deixa de ser "mudança
  grande fora do plano" e passa a ser este plano. P1 (editar o JSON/um formulário fora do painel e rodar
  `cv_render.py`) sai quase de graça; P2 (editor no painel) fica mais estreito que um Markdown livre: um campo por
  id, só nos campos não travados, mesmas guardas.
- Trade-offs com a regra do painel:
  - **texto livre**: GERAR e EDITAR com ChatGPT não mudam (o pedido segue pela stdin, guardas iguais). A opção B, se
    virar revisão obrigatória, reduz o que vai a LLM sem filtro. P2 seria a 4ª exceção, mas para um renderer
    determinístico, não para um bot.
  - **painel sem escrita**: inalterado; quem grava documento e PDF é o job-search. Nada vai à planilha.
  - **PDF por sha256**: inalterado e mais forte: `cv.json` passa a ancorar também o documento e o template, e o PDF
    é reproduzível a partir deles.

## Decisões (aprovadas pelo usuário em 2026-10-07)

- D1. Template derivado do HTML do Claude Design com CSS próprio (sem `doc-page.js`/`support.js` versionados) e o
  critério de paridade acima, incluindo o +1 px. **Aprovado: PT e EN** (lado a lado de cada idioma).
- D2. Exportar também o documento EN. **Feito** (`RESUMES.zip`); paridade EN na tabela acima.
- D3. Opção B do "Pedir edição": **(a) a revisão pelo ChatGPT passa a ser obrigatória** no caminho `local`. Não há
  aplicador para texto livre; a edição manual estruturada (P1/P2) fica fora deste plano.
- D4. Regra de uma página: **(a) cortes determinísticos** (ENCAIXE EM UMA PÁGINA, depois `mandatory: no` em ordem
  inversa, re-renderizando) e, se ainda estourar, PRECISA_HUMANO `PAGE_OVERFLOW`.
- D5. **Sim**: currículo só no host (Hermes); Grok/CV Operator saem deste fluxo.
- D6. **Sim**: este plano substitui o de 2026-10-06, que passa a ser só P1/P2 sobre o `cv-doc`.

## Andamento

- 2026-10-07, passo 2 da migração (job-search `a45f8a5`..`77db4d0`, nada do fluxo atual muda): template
  `templates/cv/classic-1.{html,css}`, `scripts/cv_doc.py` (schema, validação, travas, limites, ids, importador),
  `scripts/cv_render.py` (render offline, medida em mídia print via `--remote-debugging-pipe`, `PAGE_OVERFLOW`,
  `-vN`), testes `scripts/test_cv_doc.py`/`test_cv_render.py` com fixtures em `scripts/fixtures/cv/`. O PDF do
  renderer tem o stream de desenho idêntico ao do protótipo aprovado, em PT e EN; critérios 1–4 passam no Chrome 154
  (a paridade é pulada em outra versão do Chrome: requalificar). `runtime/cv-base-{pt,en}.json` gerados pelo
  importador. Folga medida: PT −v2 156,6 px, EN Hatch 61,4 px. Travado além da lista acima: o cargo da experiência
  (as REGRAS já proíbem mudar "cargos reais"). Falta: `apply(patch)` e os passos 3+ (chave `JSB_CV_RENDERER`).
- 2026-10-07, `cv-patch` (job-search `a528e3a`..`d16383e`, nada do fluxo atual muda): `cv_doc.apply` (puro, as seis
  operações, ids novos do host, `PatchError` com códigos `PATCH_*`), `scripts/cv_patch.py` (`parse`, `check` com todos
  os erros por CHANGE para o FORMAT_REPAIR, fatos checáveis sem LLM, `fit` da D4 com `measure` injetável e
  `PAGE_OVERFLOW`), testes `test_cv_doc.py`/`test_cv_patch.py` (inclusive patch real PT e estouro real EN medidos no
  Chrome 154). Escolhas: `expect` de item inteiro = título (projeto) ou rótulo (competência); INSERT só de bullet
  (linhas são travadas), DUPLICATE só de projeto e de categoria de competência (os itens de FORMAÇÃO são bullets,
  como na skill; experiência/formação inteiras são travadas); os cortes de ENCAIXE EM UMA PÁGINA são CHANGEs
  REPLACE (mais curto) ou REMOVE numerados em sequência com os demais; uma omissão que quebra outra mudança não é
  feita; "Chemical Engineer" isolado também é recusado. Falta: passo 3 (chave `JSB_CV_RENDERER`, prompt endereçado).
- 2026-10-07, passo 3 da migração (job-search `64c3005`..`a0c1d09`; com o padrão `claude_design` nada muda, o prompt
  do Claude Design é idêntico byte a byte): chave `JSB_CV_RENDERER`, senão `$STATE/cv-renderer` (o painel roda o
  dispatcher com env mínimo), senão `claude_design`, fixada no registro do disparo e exposta no `list`
  (`cv_renderer`). `hermes/browsers/cv_local.py` (base endereçada com `[TRAVADO]`, formato e REPAIR do cv-patch,
  encaixe D4a, export: render `-vN`, `cv-doc.json` e handoff da vaga com `.bak`, `cv.json` `cv/3`); `cv_pipeline`
  (`renderer="local"`, etapa `render`), `cv_edit.review_local` (revisão sempre, D3a), `cv_export` `cv/3` (o
  `template_sha256` só fica registrado). Decisões do usuário no passo 3: base fixa; chave por env ou arquivo de
  estado; edição de currículo feito pelo Claude Design no `local` = `CV_DOC_MISSING` (gerar de novo). Escolhas:
  `CV_JOB_BUSY` (mesma vaga gerando e editando; vale também para o PREENCHER), `CV_LOCAL_HERMES_ONLY` (D5),
  `PAGE_OVERFLOW:<linhas>` em `PRECISA_HUMANO` com motivo e retomada só "chatgpt", `CHROME_NOT_QUALIFIED` fora do
  Chrome 154; o `local` não grava o snapshot (rollback). Smoke com Chrome 154 real e ChatGPT falso: PDF A4 de 1
  página, `cv/3` VALID. Falta: passo 4 (uso real) e o painel (esconder o Claude Design; textos de `PAGE_OVERFLOW`,
  `PATCH_*`, `CV_JOB_BUSY`, `CV_DOC_MISSING`, `CV_LOCAL_HERMES_ONLY`, `CHROME_NOT_QUALIFIED`; "Pedir edição" com
  revisão obrigatória no `local`).

## Itens

job-search

- [x] `templates/cv/classic-1.html` + CSS, gerados do `.dc.html`; fixtures (PDF de referência PT/EN + `cv-doc`)
- [x] `scripts/cv_doc.py`: schema `cv-doc/1`, importador do `.dc.html`, `apply(patch)`, campos travados, limites, ids
- [x] `scripts/cv_render.py`: escape, Chrome headless offline (`--print-to-pdf`, sem rede), medida de folga via CDP
      em mídia print, 1 página, `-vN` sem sobrescrever; teste de paridade (critério 1–4) e casos maliciosos
      (`<script>`, `{{`, controle, link fora da lista)
- [x] `cv_pipeline`: prompt com base endereçada, parser/validator `cv-patch`, regra D4, etapa `render`
- [x] `cv_edit`: revisão → `cv-patch`; opção B conforme D3; remover `CV_DOC_AT_OTHER_JOB` só no caminho `local`
- [x] `cv_export` `cv/3` (`doc_sha256`, `template_sha256`) com `verify` aceitando `cv/2` legado; testes de regressão
- [x] `dispatch.py`: chave `JSB_CV_RENDERER`, pré-condições do caminho `local` (sem Chrome do Cloud Design/painéis)
- [x] Docs: `methodology/resume-handoff.md`, `resume-tailoring.md`, docstrings
- [x] Gates: `python3 -m unittest test_dispatch test_cv_edit test_cv_pipeline` + testes novos
- [ ] Passo 4: uso real em algumas vagas com `local` (ChatGPT de verdade), conferindo cada PDF

painel

- [ ] Esconder "Abrir navegador do currículo" e o toast `CLOUDDESIGN_CDP_DOWN` quando o job-search informar o
      renderer `local`; textos de recusa novos (`PAGE_OVERFLOW`, `PATCH_*`)
- [ ] CLAUDE.md: fluxo do currículo sem Claude Design (e a 4ª exceção, só se P2)
- [ ] Gates: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm format:check`; E2E só sem o servidor real
      na porta 3000

aposentadoria (depois de D-corte)

- [ ] remover `cv_claude_chrome.py`, `open-browser clouddesign`, probes, skill `ajustar-curriculo`, `openCvBrowser`
