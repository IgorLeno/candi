# Carta de apresentação pelo mesmo processo do currículo — plano

Status: **implementado (Tarefas 1–9), sem rodada real** — **aprovado** (2026-10-15: "aprovado, pode seguir com as recomendações" — C1–C12 = as recomendadas; C11 com
`_pt`/`_en`). Em implementação.

> **Para quem for executar:** depois das decisões, usar superpowers:executing-plans (ou subagent-driven-development)
> tarefa a tarefa; TDD em cada tarefa; itens com `- [ ]`.

**Objetivo:** gerar, para a vaga que pedir, uma carta de apresentação em PDF de uma página, com o layout feito no
Claude Design (Ausenco), pelo mesmo caminho que deu certo no currículo: Projeto do ChatGPT em duas etapas (análise →
montagem, raciocínio High), conferência pelo host sem LLM, renderer local (Chrome headless), registro verificado,
card no painel e anexo no "Preencher vaga".

**Arquitetura:** espelho do currículo local, com módulos próprios (`letter_*`) que reaproveitam as peças comuns
(`chatgpt_exchange`, `cv_project`, `cv_render._Pipe`/Chrome, `jsutil`, `cv_patch.split_doubts`/`fact_errors`). A carta
não é patch sobre uma base: o ChatGPT escreve o texto inteiro num formato fixo; o host confere, mede, renderiza.

**Stack:** Python 3 (job-search, `hermes/browsers` + `scripts`), Chrome 154 headless, Next.js/React/zod (painel),
Vitest, Playwright.

## Pedido (2026-10-15, palavras do usuário)

"Criar um segundo campo parecido com o currículo, que é a carta de apresentação. Não é toda vaga que pede, mas quando
pedir, eu quero que isso também passe pelo mesmo processo que passa o currículo. [...] Eu quero que o processo de
construção da carta siga a mesma diretriz que a gente faz para o currículo, uma vez que deu certo."

Referência: o primeiro currículo pelo processo atual (Eurofins 4472009760, disparo d-20261015T070128Z-fe7b9e) saiu
como o usuário queria.

## O que existe hoje (lido no código, 2026-10-15)

- **Nada de carta** no job-search nem no painel (grep `carta|cover letter`: só a frase do `cv_local.EDITORIAL_RULES`
  "sem parecer uma carta de motivação" e a de `resume-tailoring.md`). Não há campo no dossier, na análise
  (`job_analysis.py`) nem no `CANDI_STATUS` do fill.
- **Currículo local (o processo a copiar):** `cv_pipeline.Pipeline._run_local` → `cv_project.ensure()` (fontes
  `evidencias.md`, `regras.md`, `curriculo-base-{pt,en}.md` + instruções, por sha256, sob flock) →
  etapa 1 `build_analysis_prompt` (`cv-analise`, PLANO ≤ 2500 caracteres) → etapa 2 `build_assembly_prompt`
  (patch compacto) → `cv_local.negotiate` (uma rodada de repair, parcial se possível) → `outcome` (FORMAT_INVALID /
  HUMAN_REVIEW_DOUBTS com respostas prontas) → `fit_doc` (uma página medida, PAGE_OVERFLOW) → `underfill` (folga ≥
  100 px volta ao ChatGPT uma vez) → `export` (PDF `-vN`, `cv-doc.json`, handoff, `cv.json` cv/3, rollback dos três) →
  `cv_export.verify`. Todo envio passa por `chatgpt_exchange` (fila flock, High conferido a cada envio).
- **Projeto do ChatGPT:** `cv_local.PROJECT_INSTRUCTIONS` começa com "Você é o autor editorial do currículo do Igor";
  as fontes são só do currículo.
- **Fill:** `claude_fill.PROTOCOL` pede `"curriculo": {"campo"}`; o host gera o CV se faltar (`make_cv`) e anexa
  (`ApplicationTab.attach_file`, `DOM.setFileInputFiles`). CPF/RG entram por `fill_document` (por rótulo,
  `Input.insertText`).
- **Painel:** página da vaga com três seções (`app/(dashboard)/vaga/[job_id]/page.tsx` `SECTIONS`); seção Currículo =
  `JobCvOps` (`components/job-search/ops.tsx`: botão, badge, card, `CvPreview` via `/api/vaga/[id]/curriculo` →
  `lib/ops/cv-file.ts` → `dispatch.py cv-file`, edição em três modos).
- **Layout da carta (zip do Claude Design):** A4, margem 0,75 in, Arial, cor #1c1c1c. Cabeçalho: nome 20 px 700
  caixa-alta (letter-spacing .04em); linha "Concluinte de Engenharia Química — UNESP" 12,5 px #444; contatos 11,5 px
  #555 separados por " · "; filete 1 px #d8d8d8; assunto 11 px 700 caixa-alta #666 ("CANDIDATURA — PROGRAMA DE
  TRAINEE AUSENCO"); data 11,5 px #777; corpo 13,3 px / 1,5, parágrafos com 11 px entre si (último 16 px);
  "Atenciosamente," e o nome. Sem localização, sem foto. PDF exportado pelo usuário:
  `~/Downloads/trampo/curriculos/carta_igor-fernandes_ausenco.pdf` (uma página, ~520 palavras, 5 parágrafos).
- **Fatos que a carta da Ausenco usa e que NÃO estão em `knowledge/`:** a motivação pela Engenharia Química
  (pré-sal na Baixada Santista), "mais de 750 testes automatizados" no Grimperium, Iniciação Científica apresentada
  no Congresso de IC da UNESP. Também usa fatos da empresa de fora do anúncio (Projeto Caldeira, escritório de BH,
  "Find a Better Way").
- **Sinal no anúncio é raro:** só 1 de 46 `posting.md` do runtime menciona carta (4469354802, ALS). O pedido de
  carta costuma aparecer só no formulário.

## Decisões para o usuário (com recomendação)

**C1. Como saber que a vaga pede carta.** Recomendo **combinação de três sinais, sem trava**:
(a) botão "Gerar carta" sempre disponível na vaga (regra de 2026-10-02: ação nunca travada por status);
(b) no "Preencher vaga", o Claude informa no `CANDI_STATUS` um campo novo `"carta"` e o host age (C8);
(c) aviso discreto "O anúncio menciona carta de apresentação" quando o `posting.md` casa com uma regex fixa
(`carta de apresentação|cover letter|carta de motivação|motivation letter`). Não mexer no schema do dossier nem na
análise do ChatGPT (mudaria Sheet/validador por um sinal que aparece em 2% dos anúncios).
Alternativas: só botão; ou campo `pede_carta` na análise (mais caro, sinal fraco).

**C2. Quando gerar.** Recomendo **sob demanda**: pelo botão e, no fill, automaticamente quando o Claude achar campo de
carta (como o currículo hoje). Não gerar junto com todo currículo (custo de ~5 min de ChatGPT em 98% das vagas sem
carta).

**C3. Projeto do ChatGPT.** Recomendo **o mesmo Projeto**, com: fonte nova `regras-carta.md` (C4) e fonte nova
`trajetoria.md` (C5); instruções reescritas para "autor editorial do currículo e da carta de apresentação do Igor"
(a sincronização por sha256 do `cv_project` já reenvia as instruções e as fontes mudadas). Um Projeto só = uma
sincronização, evidências iguais para CV e carta. Alternativa: Projeto separado (mais isolamento, duas sincronizações
e mais uma URL para configurar).

**C4. Mesma estratégia s5 (duas etapas).** Recomendo **sim**: etapa 1 ANÁLISE (PLANO curto: ângulo da carta, 2–3
evidências centrais, gancho com a empresa tirado do anúncio, o que não dizer) e etapa 2 REDAÇÃO (texto final no
formato fixo, dentro de um bloco ```text). Mesma fila, High obrigatório, uma rodada de repair, dúvidas com 2–5
respostas prontas e retomada pelo painel.

**C5. Fatos pessoais da carta.** A carta precisa de trajetória e motivação, que hoje não são fatos canônicos.
Recomendo **criar `knowledge/trajetoria.md`** (autoridade, como o resto de `knowledge/`), com um rascunho que eu
extraio da carta da Ausenco (que você escreveu/aprovou) e que **você confirma item a item** antes de entrar: motivação
pelo pré-sal, 750 testes, Congresso de IC. Sem isso, a regra de fatos proíbe o ChatGPT de usá-los e a carta fica
genérica.

**C6. Fatos da empresa.** Recomendo **só o texto do anúncio + o que você escrever como orientação** (o campo
"Outro"/nota, como no currículo travado). O ChatGPT não pesquisa na web nessa etapa: fato de empresa sem fonte
conferível é o tipo de erro que a regra de fatos existe para impedir. Alternativa: permitir pesquisa web com seção
obrigatória `FONTES DA EMPRESA` (URLs) que o painel mostra para você conferir antes do PDF (mais rico, mais risco).

**C7. Regras editoriais da carta** (texto de `regras-carta.md`; proposta, ajuste à vontade):

- mesmas regras de fato do currículo (`cv_local.FACT_RULES`) e a mesma regra de projeto para leigo (problema antes da
  ferramenta; Grimperium com o mecanismo canônico);
- ao contrário do resumo do currículo, a carta **fala da empresa e da vaga**, mas só com o que o anúncio diz (C6),
  sem slogan copiado como elogio vazio;
- 4–5 parágrafos: trajetória/motivação → duas evidências concretas que se complementam → como trabalha → por que
  esta vaga/empresa (com fato do anúncio) → disponibilidade e fechamento; uma página A4 no layout fixo, alvo 400–550
  palavras; nada de repetir bullets do currículo palavra por palavra; coerente com o currículo desta vaga;
- idioma = o do currículo (detecção do `cv_pipeline.language` no anúncio); EN usa "Dear ... ," / "Sincerely,";
- primeira pessoa, sem clichê ("venho por meio desta", "sou apaixonado"), sem "Engenheiro Químico" antes da colação;
- data e cabeçalho são do host, nunca do ChatGPT.

**C8. Anexo no fill.** Recomendo o campo novo no `CANDI_STATUS`:
`"carta": {"campo": rótulo, "tipo": "ARQUIVO" | "TEXTO", "limite": número de caracteres ou null}`.
ARQUIVO = o host anexa o PDF como faz com o currículo. TEXTO = o host digita o texto da carta no campo por rótulo
(mesmo mecanismo do CPF, `Input.insertText`), e o Claude é avisado para não alterar. Carta inexistente = o host gera
(C2) e segue. Texto maior que o `limite` = pendência no painel ("o campo aceita N caracteres") com o caminho de
editar no Manual (C10); o host nunca corta sozinho.

**C9. Coerência com o currículo da vaga.** Recomendo: se o currículo da vaga está VALID, o texto dele (`cv-doc.json`
endereçado) vai na mensagem da etapa 1 como "CURRÍCULO DESTA VAGA"; se não houver, a carta segue sem ele (sem trava,
sem gerar currículo antes). Alternativa: gerar o currículo antes quando faltar (mais coerência, +5 min).

**C10. Edição.** Recomendo um **subconjunto** dos modos do currículo:

- **Manual**: editor no painel com assunto, saudação, parágrafos (adicionar/remover/reordenar), despedida; o host
  confere schema, guardas de texto e uma página; PDF `-vN`; marca `USER/MANUAL`;
- **Pedir ajuste ao ChatGPT**: seu pedido + a carta atual na mesma conversa da geração (ou chat novo no Projeto); a
  resposta é a carta inteira nova; o painel mostra antes/depois e você aprova **a carta inteira** (não item a item:
  prosa não se aprova por CHANGE).
  Sem "segunda avaliação" (modo 1) no começo; entra depois se fizer falta.

**C11. Nome do arquivo.** Recomendo o padrão do currículo, com idioma:
`carta_igor-fernandes_pt_<empresa>.pdf` / `cover-letter_igor-fernandes_en_<empresa>.pdf`, mesma pasta
(`~/Downloads/trampo/curriculos`, `JSB_CURRICULOS_DIR`), `-vN` sem sobrescrever. O seu export manual da Ausenco ficou
`carta_igor-fernandes_ausenco.pdf` (sem idioma): confirmar se quer com ou sem `_pt`.

**C12. Painel.** Recomendo **uma quarta seção "Carta de apresentação"** entre Currículo e Candidatura (link no
cabeçalho da vaga), com: botão "Gerar carta", badge "Carta pronta / não gerada", aviso de C1(c), card do disparo
(etapas: Projeto → Análise → Redação → Conferência → PDF → Verificação; dúvidas com respostas; "Ver navegador"),
preview do PDF e os dois modos de edição. Alternativa: dentro da seção Currículo (menos navegação, seção mais longa).

## Desenho (com as recomendações; muda se as decisões mudarem)

### Documento e template (`scripts/`, `templates/letter/`)

`letter-doc/1` (um JSON por carta, texto puro, NFC, sem `<`/`>`):

```json
{
  "schema": "letter-doc/1",
  "template": "classic-1",
  "lang": "pt",
  "header": { "name": "...", "subtitle": "...", "contact": "..." },
  "subject": "CANDIDATURA — ...",
  "date": "15 de outubro de 2026",
  "greeting": "Prezada equipe de Recrutamento da ...,",
  "paragraphs": [{ "id": "p1", "text": "..." }],
  "closing": "Atenciosamente,",
  "signature": "Igor Leno de Souza Fernandes"
}
```

`header` vem de `runtime/letter-base-{lang}.json` (fixa, como `cv-base`), nunca do ChatGPT; `date` é do host (data
local, por extenso no idioma). Limites: 3–6 parágrafos, 1200 caracteres cada, assunto 120, saudação 120.
Template `templates/letter/classic-1.html` + `.css` com os estilos do `.dc.html` copiados sem mudança e a página A4
com margem 0,75 in que o `doc-page.js` dava; medida de folga no mesmo esquema do `cv_render` (texto além do limite
inferior = `PAGE_OVERFLOW:<linhas>`). Paridade: comparação visual com `carta_igor-fernandes_ausenco.pdf`
renderizando a própria carta da Ausenco como fixture (texto idêntico, quebras de linha iguais ou aprovadas por você).

### Pipeline (`hermes/browsers/letter_pipeline.py`)

`packet` (dossier, posting, idioma, currículo da vaga se VALID, base da carta) → `cv_project.ensure()` →
`chatgpt` etapa 1 (`carta-analise`) → etapa 2 (`carta`) → `parse/check` (formato `CARTA` abaixo; uma rodada de
repair) → dúvidas (`HUMAN_REVIEW_DOUBTS`, respostas prontas) → `render` (medida; estouro = uma rodada pedindo para
encurtar N linhas; folga grande não volta: carta curta é aceitável) → `export` (PDF `-vN`, `letter-doc.json`,
`letter-handoff.md`, `letter.json` `letter/1` com sha256 de PDF/doc/handoff/template, rollback) → `verify`.

Formato da etapa 2 (dentro de ```text):

```
CARTA
assunto: <...>
saudação: <...>
parágrafo 1: <...>
parágrafo 2: <...>
...
despedida: <...>

DÚVIDAS PARA INTERVENÇÃO HUMANA
<DÚVIDA 1: ... / RESPOSTA 1.1: ... ou "nenhuma">
```

Conferências do host (sem LLM): campos obrigatórios, contagem e tamanho de parágrafos, guardas de texto do `cv_doc`,
números novos contra `knowledge/` (reuso de `cv_patch.fact_errors`), "Engenheiro Químico" antes da colação
(`cv_patch._ENGINEER`), nome/contato ausentes do corpo (ficam no cabeçalho).

### Dispatcher (`hermes/browsers/dispatch.py`)

Ação `GERAR_CARTA` (host, filho `_letter` em `HOST_CHILDREN`, `per_job`, só Hermes/local), `EDITAR_CARTA`
(`--manual-stdin` | `--request-stdin`, filho `_letteredit`), `letter-file <job_id>` (só leitura, como `cv-file`),
`resume-letter` (ou `resume-cv` generalizado) com `--answers`/`--note-stdin`; `progress` com as etapas acima;
`list` expõe `job.letter` (VALID/ausente) e `job.letter_hint` (C1c). Mesmas recusas técnicas do currículo
(`CHROME_NOT_QUALIFIED`, `CV_PROJECT_*`, `DISPATCH_ACTIVE` da mesma ação na vaga).

### Fill (`hermes/browsers/claude_fill.py`)

`PROTOCOL` com `"carta"` (C8); `_items_from` devolve `letter`; `_apply` anexa (ARQUIVO) ou digita (TEXTO) com
`make_letter` análogo a `make_cv`; resultado no `state["host"]` e pendência quando falhar ou passar do limite.

### Painel (`estagios-dashboard`)

`lib/ops/schema.ts` (ação, progress, `letter`/`letter_hint`, `letterFileResultSchema`, `letterDocSchema`),
`lib/ops/letter-file.ts` + `app/api/vaga/[job_id]/carta/route.ts` (bytes conferidos por sha256 como o currículo),
`app/actions/ops.ts` (`startLetter`, `saveLetterManual`, `requestLetterEdit`, `resumeLetter`),
`components/job-search/letter-ops.tsx` (seção, preview, editor Manual, formulário de pedido, aprovação antes/depois),
`page.tsx` (`SECTIONS` + nav), fake do E2E (`e2e/`) com as ações novas.

## Tarefas (itens checáveis; o código de cada passo é escrito no TDD da tarefa, depois das decisões)

### Fase 0 — insumos que só você dá

- [x] C1–C12 decididas (todas as recomendadas, 2026-10-15).
- [ ] `knowledge/trajetoria.md`: eu rascunho a partir da carta da Ausenco; você confirma cada fato (C5).
- [ ] Subtítulo do cabeçalho por idioma ("Concluinte de Engenharia Química — UNESP" e o equivalente em inglês).

### Tarefa 1 — documento `letter-doc/1` (job-search `scripts/letter_doc.py`)

- [x] Teste: `validate` aceita a carta da Ausenco como fixture e recusa: parágrafo vazio, 7 parágrafos, `<` no texto,
      parágrafo > 1200, campo de cabeçalho alterado em relação à base.
- [x] Implementar `validate`, `load_base(runtime, lang)`, `paragraphs_text(doc)`.
- [x] Gates + commit `feat(letter): add the letter-doc/1 document`.

### Tarefa 2 — template e renderer (`templates/letter/classic-1.*`, `scripts/letter_render.py`)

- [x] Teste: `build_html` determinístico e escapado; `measure` da fixture Ausenco = cabe com folga ≥ 0; fixture com
      +6 parágrafos = overflow; PDF de 1 página (`cv_render.pdf_pages`); `output_path` nunca sobrescreve (`-v2`).
- [x] Implementar reaproveitando `cv_render` (`_Pipe`, flags offline, `chrome_version`), sem copiar código: extrair o
      que for comum para funções que os dois chamam, se precisar.
- [x] Paridade visual: renderizar a Ausenco e pôr lado a lado com o seu PDF; **sua aprovação visual** (PT; EN quando
      houver texto EN).
- [x] Commit `feat(letter): render the cover letter locally`.

### Tarefa 3 — Projeto do ChatGPT (`cv_local`/`cv_project`)

- [x] Teste: `cv_project.desired()` inclui `regras-carta.md` e `trajetoria.md`; instruções novas mudam o sha e
      forçam `set_instructions`; o prompt do currículo continua igual (teste de não-regressão do `PROJECT_RULES`).
- [x] Implementar `SOURCE_NAMES` + `LETTER_RULES` + instruções genéricas.
- [x] Commit `feat(cv): keep the cover letter sources in the ChatGPT Project`.

### Tarefa 4 — parser/conferência da carta (`hermes/browsers/letter_local.py`)

- [x] Teste: `parse` do formato `CARTA` (com e sem cercas, acentos e variação de caixa nos rótulos); `check` acusa
      número sem lastro, "Engenheiro Químico", parágrafo fora do limite, saudação ausente; dúvidas com respostas
      (`cv_patch.split_doubts`); `REPAIR` só uma vez.
- [x] Implementar `ANALYSIS_HEAD`, `PLAN_FORMAT`, `WRITE_HEAD`, `LETTER_FORMAT`, `parse`, `check`, `negotiate`.
- [x] Commit `feat(letter): parse and check the ChatGPT cover letter`.

### Tarefa 5 — pipeline (`hermes/browsers/letter_pipeline.py`)

- [x] Teste com `exchange` falso: caminho feliz (duas mensagens, PDF, `letter.json` VALID); dúvida → BLOCKED com
      respostas; formato inválido depois do repair → `FORMAT_INVALID`; estouro → uma rodada "encurte N linhas" e depois
      `PAGE_OVERFLOW:<n>`; falha no registro → rollback dos três arquivos; currículo VALID entra no prompt, ausente não.
- [x] Implementar `Pipeline.run` e `letter_export.record/verify` (`letter/1`).
- [x] Commit `feat(letter): generate the cover letter through the ChatGPT Project`.

### Tarefa 6 — dispatcher

- [x] Teste pelo `main(argv)` com o argv exato do painel (lição 2026-10-05): `start GERAR_CARTA --platform hermes
--job-id X`, `letter-file X`, `start EDITAR_CARTA ... --manual-stdin|--request-stdin`, `resume-letter`; `_alive`
      reconhece `_letter`/`_letteredit` com processo real (lição 2026-10-02); `list` traz `letter`/`letter_hint`.
- [x] Implementar e atualizar `RUNTIME.md`.
- [x] Commit `feat(dispatch): add GERAR_CARTA and EDITAR_CARTA`.

### Tarefa 7 — edição (`hermes/browsers/letter_edit.py`)

- [x] Teste: Manual com documento inteiro (schema, guardas, uma página, `-vN`, marca USER/MANUAL, `LETTER_DOC_CHANGED`
      se a carta mudou depois de abrir o editor); pedido ao ChatGPT → proposta antes/depois sem tocar na vaga; aprovação
      aplica.
- [x] Commit `feat(letter): edit the cover letter manually or through ChatGPT`.

### Tarefa 8 — fill

- [x] Teste: `CANDI_STATUS` com `carta` ARQUIVO anexa (gera antes se faltar); TEXTO digita por rótulo; texto acima do
      limite vira pendência; `carta` ausente não muda nada do fluxo de hoje; status antigo sem a chave continua válido.
- [x] Commit `feat(fill): attach or type the cover letter`.

### Tarefa 9 — painel

- [x] Vitest: schemas novos; rota `/api/vaga/[id]/carta` recusa hash diferente; seção mostra botão/badge/aviso; editor
      Manual (RTL) recarrega quando a carta muda (lição do `CvManualEditor`, 3477d60).
- [x] Fake do E2E com as ações novas + teste E2E da seção, **numa cópia em outra porta** se a 3000 for o seu
      `next dev` (lições 2026-09-30 e 2026-10-03).
- [x] Commits: `feat(ops): add the cover letter section`, `test(e2e): cover the cover letter section`.

### Tarefa 10 — verificação real (só com o seu OK)

- [ ] `cv_project.py sync` (sobe as duas fontes novas e as instruções).
- [ ] Uma carta real numa vaga que você escolher (sugestão: ALS 4469354802, que pede carta no anúncio).
- [ ] Push dos dois repos (pergunto antes; `git pull --ff-only` antes).

## Riscos e foco de revisão

- **Fato pessoal sem lastro:** sem `trajetoria.md` confirmado, a carta ou fica genérica ou inventa. Por isso C5 vem
  antes da Tarefa 4.
- **Fonte em inglês:** Arial vira Liberation Sans no Fedora (igual ao PDF do Claude Design que você exportou? conferir
  na Tarefa 2 pelo `pdffonts`); quebra de linha diferente muda a medida de uma página.
- **Campo de texto do formulário com limite curto** (comum na Gupy): C8 manda para pendência, nunca corta.
- **Projeto compartilhado:** mudar as instruções afeta o currículo; o teste de não-regressão da Tarefa 3 e uma geração
  de currículo de controle depois do sync (com OK) cobrem isso.
- **Fill com dois arquivos:** formulário com um campo só de anexo para "currículo e carta" → pendência para você.

## Fora do escopo

Carta pelo Grok/Claude Design; carta em vaga sem `dossier.json` (mesma exigência do currículo); gravar algo na Sheet;
enviar candidatura.

## Andamento (2026-10-15)

Feito (job-search, commits na main, pushados 2026-10-15 até a6f42fc; painel pushado até 1d088ba): 9fb7546 letter-doc, 7e26321 refactor `cv_render.print_page`/`measure_page`,
7d8833d template + renderer (paridade com o PDF da Ausenco), 40d6b14 regras/parser/conferência (`letter_local`), 2b51372
fontes no Projeto, 79407b1 pipeline + `letter_export`, d3794eb `letter_edit`, 6dfa436 dispatcher (GERAR_CARTA,
EDITAR_CARTA, `letter-file`, `letter-doc`, `apply-letter`, `resume-cv` também para carta, `job.letter`/`letter_hint`),
ae883ca fill (`carta` no CANDI_STATUS), f684ef8 RUNTIME.md, 9793a15 `letter_proposal` em campo próprio.
Painel: seção "Carta de apresentação", rota `/api/vaga/[id]/carta`, actions, `PdfPreview` comum, fake do E2E e testes.

Desvios do desenho, decididos na implementação:

- Sem `runtime/letter-base-{lang}.json`: o cabeçalho sai do `cv-base-{lang}.json` (nome e contatos, a mesma fonte
  travada do currículo) + subtítulo fixo em `letter_doc.SUBTITLE`. Um arquivo a menos para manter em dia.
- Parada (dúvida, formato, estouro) grava `letter-blocked.md`, não troca o `letter-handoff.md`: a carta VALID anterior
  continua valendo (no currículo, o handoff BLOCKED invalida o currículo anterior).
- `knowledge/trajetoria.md` criado em f34d405 com a trajetória confirmada pelo usuário em 2026-10-15 (fatos pessoais
  da carta da Ausenco; os da empresa ficam fora). Sem o arquivo, a fonte `trajetoria.md` do Projeto continua dizendo
  que não há trajetória confirmada. Subtítulo EN aprovado (a6f42fc).
- Paridade: uma linha da Ausenco termina colada na borda (721,74 px de 722) no Chrome 152 da referência e quebra uma
  palavra antes no Chrome 154; o teste aceita só esse caso (linha da referência encostada na borda).
- Proposta da edição por pedido vai em `progress.letter_proposal` (só antes/depois), não em `progress.proposal`, que é
  o contrato da proposta do currículo.

Pendente: Tarefa 10 (sync do Projeto + carta real, só com OK do usuário).
