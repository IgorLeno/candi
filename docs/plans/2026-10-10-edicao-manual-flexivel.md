# Edição manual do currículo flexível (2026-10-10) — desenho para aprovação

Pedido do usuário (2026-10-10), depois do Manual da MRV&CO (gupy-12484524, d-20261010T024405Z-aeab6d CONCLUIDO), em que
trocou a ordem Grimperium/Candi reescrevendo o texto dos campos e o segundo projeto ficou sem campo de link:

1. Sem cadeados no modo Manual: nome, contato, cargos, datas, instituições, certificações, idiomas, títulos de seção.
2. Estrutura editável: adicionar/remover bullet, adicionar/remover link de projeto, reordenar itens (projetos).
3. Rótulos genéricos ("Projeto 1 · Título", "Bullet 2", "Link"), nunca o nome salvo do item.
4. Um botão "+" por item/seção com as opções (adicionar link, adicionar tópico, remover, mover).

Reabre a decisão E5 do plano `2026-10-07-editar-curriculo-tres-modos.md` (manual = só REPLACE em campo destravado).

## Estado de partida (lido no código em 2026-10-10)

- `cv_doc` (`scripts/cv_doc.py`): estrutura fixa de 7 seções (`SECTIONS`), ids estáveis e **semânticos**
  (`projects/grimperium`, `projects/candi`): depois da troca por texto, `projects/grimperium` guarda o Candi com o
  link do Grimperium. `LOCKED`/`is_locked` (nome, contato, cargo/data/instituição, certificações, idiomas) vale para
  qualquer patch. `LIMITS`: 2 projetos, 3 bullets por item, 2 bullets em formação, 4 linhas de competência; seção sem
  item = `SECTION_EMPTY`. Link só em projeto, `https://` em `LINK_HOSTS` (github.com, linkedin.com).
- `org` é `{strong, rest}` (negrito + resto); o `paths()` mostra `strong — rest` e `apply_change` REPLACE gravaria uma
  string no lugar do dict (inalcançável hoje porque `*/org` está travado).
- `cv_edit.editable_doc` → lista plana de campos com `item` = texto atual do título (rótulo errado depois de troca) e
  `locked`. `cv_edit.manual_changes` → só REPLACE; `manual_local` aplica, mede, `PAGE_OVERFLOW:<n>` sem cortes.
- Painel: `CvManualEditor` (`components/job-search/ops.tsx`) edita `Record<path, text>`; `normalizeManualEdits`
  (`lib/ops/cv-manual.ts`) espelha as guardas; `saveCvManual` manda `{doc_sha256, edits}` pela stdin (≤ 24 KB).
- Documento real: ~4,9 KB em JSON compacto.

## Desenho proposto

### Contrato: o documento inteiro, não uma lista de operações

Com inserir/remover/mover, uma lista de ops com `expect` e ids que nascem no host obriga o painel a prever ids e
encadear paths. Mais simples e igualmente seguro: o painel edita uma cópia do `cv-doc` e manda o **documento final**;
o job-search confere tudo de novo e calcula a diferença.

- `cv-doc <job_id>` (versão 2 da resposta): `{job_id, lang, filename, doc_sha256, doc, limits, max_len}`; `doc` é o
  `cv-doc/1` da vaga (só texto puro, já validado). Sai `locked` e `item` (rótulos são do painel, por posição).
  `limits`/`max_len` vêm de `cv_doc`: o painel não recalcula, só orienta.
- `start EDITAR_CURRICULO --platform hermes --job-id ID --manual-stdin` recebe
  `{"schema": "cv-manual/2", "doc_sha256": "…", "doc": {…cv-doc/1…}}` (≤ 24 KB; o argv não muda). Formato antigo
  `{doc_sha256, edits}` passa a ser `MANUAL_INVALID` (só o painel o envia; os dois mudam juntos).
- Conferência no job-search (`cv_edit.manual_doc`, substitui `manual_changes`):
  1. forma: `schema`, `doc_sha256` = hash do `cv-doc.json` atual (senão `CV_DOC_CHANGED`);
  2. cada texto do documento novo: NFKC + espaços colapsados (o host normaliza, não o painel), `cv_doc.text_errors`
     pelo tipo, `manual_guard` (aprovação, `[painel:`, marcador) → `MANUAL_TEXT_<…>:<path>`;
  3. `cv_doc.validate` do resultado (seções fixas e na ordem, ids `ID_RE` únicos, link só em projeto e em
     `https://` de domínio público (M3), limites) → `MANUAL_<código>:<path>`; ids novos o painel gera (`n1`, `n2`…), o host só valida;
  4. igual ao atual (canônico) = `MANUAL_NO_CHANGES`;
  5. grava `edicao-manual.json` (0600, o documento normalizado) e o filho mede/renderiza como hoje.
- Handoff `USER/MANUAL`: em vez de "só troca de texto", a lista de diferenças por path (`+ adicionado`,
  `- removido`, `~ alterado`, `↕ ordem`), calculada pelo host a partir de `paths()` antigo × novo.
- **Travas**: o modo Manual ignora `LOCKED` (o texto é do próprio usuário, autoridade dos fatos dele, como a opção B
  de 2026-10-03). Modos 1 e 2: ver M4. O pipeline de geração mantém `LOCKED`.
- `org` no Manual: dois campos, "Instituição (negrito, pode ficar vazio)" (`strong`) e "Instituição (resto)" (`rest`).
- Seções: as 7 continuam fixas (template `classic-1`): título editável, não se remove nem reordena seção; cada seção
  com itens precisa de ao menos um (validate de hoje).

### Painel

- `cvDocSchema` v2 (zod estrito do `cv-doc/1`: seções por `kind`, limites de tamanho) + `limits`/`max_len`.
- `lib/ops/cv-manual.ts`: modelo puro do editor sobre o documento (`setText`, `addBullet`, `removeBullet`,
  `moveItem`, `addLink`/`removeLink`, `addItem`/`removeItem`, `addLine`/`removeLine`, `addRow`/`removeRow`), cada
  operação recusando o que passa dos `limits` (UX); `checkManualDoc` espelha as guardas de texto; `diffCount` para
  "Salvar e gerar PDF" só com mudança. Ids novos: `n<k>` livre na lista.
- `CvManualEditor`: por seção, os itens em ordem com rótulo por posição ("Projeto 1", "Experiência 1", "Linha 2",
  "Competência 3"); campos "Título", "Data", "Instituição", "Complemento", "Link", "Bullet 1…"; o texto completo fica
  só dentro do campo. Botão "+" (menu Radix já usado no painel) por item: adicionar bullet, adicionar/remover link
  (projetos), mover para cima/baixo, remover item; por seção: adicionar item/linha. Opção fora do limite aparece
  desabilitada com o motivo ("máximo de 3 bullets"). Sem cadeados.
- `saveCvManual(jobId, {docSha256, doc})`: `getAllowedSession()`, relê `cv-doc`, hash, `checkManualDoc`, 24 KB,
  stdin. Refusal texts para os códigos novos em `present.ts`.
- Fake do E2E: `cv-doc` v2 e `--manual-stdin` v2.

### O que não muda

Texto só pela stdin, nunca argv; argv fixo; sem IA no modo 3; revalidação total no job-search (hash, `validate`,
guardas, encaixe em 1 página, `PAGE_OVERFLOW:<n>` sem cortes automáticos); painel sem credencial de escrita; nada toca
a Sheet. Modos 1 e 2 e o renderer `claude_design` sem mudança.

## Decisões (usuário, 2026-10-10)

- M1. Contrato: **documento inteiro** (`cv-manual/2`).
- M2. Limites de estrutura no Manual: **mantidos** (opção fora do limite fica desabilitada com o motivo).
- M3. Links: **qualquer `https://`** (host com ponto, sem usuário/porta; texto puro). Vale em `cv_doc.link_errors`,
  portanto também nos patches do ChatGPT (que o usuário aprova item a item).
- M4. Travas nos modos com ChatGPT: **somem também** nos modos 1 e 2 do "Editar currículo" (aprovação item a item).
  Leitura desta sessão: a pergunta dizia "você ainda aprova item a item", então o GERAR_CURRICULO (sem aprovação)
  continua com `LOCKED`. Implementação: `cv_doc.apply(…, locked=True)` por padrão; `cv_patch.check/check_subset/fit`
  recebem `locked`; os modos 1/2 passam `locked=False`, o prompt deles sai sem `[TRAVADO]` e a regra de fato vira
  "só com pedido explícito do usuário". `org` passa a aceitar REPLACE (`forte — resto`).

## Itens

job-search (commits pequenos, com testes)

- [x] `cv_edit`: `editable_doc` v2 (documento + limites), `manual_doc` (substitui `manual_changes`), diff para o
      handoff, `manual_local` com o documento; `render_manual_handoff` com a lista de diferenças
- [x] `cv_doc`: helper `diff(old, new)` por path; nada muda em `LOCKED`/`apply`
- [x] `dispatch.py`: `--manual-stdin` aceita `cv-manual/2`; `cv_doc_view` v2; docstring
- [x] Testes `test_cv_edit`/`test_dispatch`: trava ignorada só no manual, add/remove/move, link novo, link fora do
      host, limites, ids inválidos/duplicados, seção vazia, hash velho, sem mudança, marcador/aprovação, 24 KB,
      formato antigo recusado; modos 1/2 continuam recusando `PATCH_LOCKED`
- [x] Docs: `methodology/resume-handoff.md` (manual v2)
- [x] M3: `cv_doc.link_errors` aceita qualquer host `https://` válido; testes
- [x] M4 (commit separado): `locked` em `cv_doc.apply`/`cv_patch`; modos 1/2 sem travas e prompt sem `[TRAVADO]`;
      GERAR_CURRICULO mantém; REPLACE de `org`; testes

painel

- [x] `schema.ts` (`cvDocSchema` v2) + testes
- [x] `lib/ops/cv-manual.ts` (modelo do editor + guardas) + testes
- [x] `app/actions/ops.ts` `saveCvManual` v2; `present.ts` textos
- [x] `CvManualEditor` em `components/job-search/cv-manual-editor.tsx` (rótulos por posição, menu "+", sem
      cadeados) + teste de componente (Vitest/RTL)
- [x] Fake do E2E + `e2e/ops.spec.ts` (cenário manual com adicionar bullet, link e mover projeto)
- [x] CLAUDE.md (seção "Currículo com renderer local"); plano de 2026-10-07 (E5 superada por este)
- [ ] Gates dos dois repos; teste isolado com cópia de `runtime/` + `JOB_SEARCH_BROWSERS_STATE` temporário e spawn stub
      sobre o `cv-doc` real da MRV&CO; uso real no painel só com OK do usuário

## Resultado local (2026-10-10)

- job-search `65a2f1d` (M3, link `https://` de qualquer domínio público) e `e7c8590` (manual `cv-manual/2`). Gates:
  `scripts` 646/646; `test_dispatch test_cv_edit test_cv_pipeline` verdes. Teste isolado sobre o `cv-doc` real da MRV&CO
  (cópia de `runtime/applications/gupy-12484524`, `JOB_SEARCH_BROWSERS_STATE` temporário, spawn stub): `cv-doc` v2 de
  5,2 KB, troca da ordem dos projetos + link novo → `start` PENDENTE, diff `+ projects/candi/link`, `↕ projects`; o
  estado real não foi tocado. O mesmo `cv-doc` real passa no zod do painel e no espelho `checkManualDoc`.
- painel: tsc, lint (2 avisos antigos), Vitest 257/257 (inclui o editor com RTL: mover, link, bullet, limite,
  payload). E2E atualizado (`e2e/ops.spec.ts` + fake) mas **não rodado**: a porta 3000 é o `next dev` do usuário e o
  Playwright reusaria esse servidor sem o fake.
- M4: job-search `94fc485` (`locked` em `cv_doc.apply`/`cv_patch`, modos 1/2 com `locked=False` e prompt
  `EDIT_RULES_AND_FORMAT` sem `[TRAVADO]`, REPLACE de `org` por `forte — resto`; geração continua travada). Gates:
  `scripts` 647/647, `test_dispatch test_cv_edit test_cv_pipeline` 178/178; o teste novo do modo 2 falha sem a
  mudança. Nenhum ChatGPT real rodado.
- Pendente: uso real no painel (o usuário clica); E2E quando a porta 3000 estiver livre.
