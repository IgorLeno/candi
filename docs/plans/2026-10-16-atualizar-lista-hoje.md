# Atualizar lista da Hoje + Cotar vagas na arquitetura atual (2026-10-16)

Pedido do usuário (2026-10-16, ditado): (1) atualizar o "Cotar vagas" (BUSCAR_VAGAS), que está defasado em relação
à arquitetura; (2) botão novo na aba Hoje, ao lado de "Sincronizar", que confere se as vagas da Hoje estão abertas,
procura entre as já cotadas as de maior interesse, garante análise do ChatGPT em toda vaga que entrar na Hoje, mostra
quando a lista foi atualizada e traz vagas novas.

Repositórios: job-search (`/home/plasma-test/Projetos/job-search`, main c5d8b56) e painel (este, main 4ac28d9). Commit
direto na main, uma preocupação por commit, sem push até o OK do usuário.

## Estado encontrado (só leitura, 2026-10-16)

- A Hoje é um filtro da planilha (`todayQueue` em `lib/job-search/present.ts`): `SELECIONADA` + `ABERTA`, ainda não
  enviada, em ordem de interesse. Hoje são 5 vagas: 4 de 22/09 (era Lince/Threadgist, `interesse NAO_CLASSIFICADO`,
  sem dossier, `ABERTA` lida há 24 dias) e 4471115696 (análise do host de 30/09, NORMAL), que é a "próxima".
- A cotação de 2026-10-16 08:44 (d-20261016T084424Z) terminou em FALHOU `BLOCKED_DISCOVERY_CDP`: o Chrome do portal
  (CDP 9223) estava fechado e não havia backlog.

### O que está defasado no Cotar vagas

1. O Chrome do portal não abre sozinho. O ChatGPT já abre o dele (`chatgpt_exchange.ensure_browser`,
   `native_profiles.sh ensure`, env da sessão gráfica).
2. Descoberta fora do ar com backlog vazio vira FALHOU sem caminho de retomada.
3. As buscas estão fixas no código (6 LinkedIn + 3 Gupy), só na 1ª página e só nos últimos 7 dias.
4. O texto do comando (`command_text`) ainda manda "enviar ao Threadgist via message_agent". No host é só descrição,
   mas engana quem lê.
5. O painel trava "Buscar vaga específica" durante a cotação ("o Lince já está com um disparo"). O dispatcher só
   recusa `PROFILE_BUSY` entre LOCALIZAR_VAGA e ANALISAR_INDICADA, não para a busca do host.
6. Não há limite de shortlist (a metodologia diz 5) nem releitura de `ABERTA` antiga. Por isso a Hoje mostra
   `SELECIONADA` de qualquer época.

## Decisões do usuário (2026-10-16)

- D1 Fluxo do "Atualizar lista", nesta ordem: relê a disponibilidade das vagas da Hoje → cotação nova (mesma
  descoberta do Cotar vagas) → junta as novas com as já cotadas e escolhe as de maior interesse → as escolhidas sem
  análise válida do host vão ao ChatGPT → grava a lista.
- D2 A Hoje comporta 5 vagas (próxima + na fila), a shortlist da metodologia.
- D3 Critério = a regra atual: só `SELECIONADA` do ChatGPT + `ABERTA`, ordem pelo interesse da metodologia
  (MUITO_ALTO > ALTO > NORMAL > BAIXO), depois a mais adiantada, depois a mais recente. Sem score novo.
- D4 O clique em "Atualizar lista" conta como o pedido de gravação: o writeset VALID é gravado no fim pelo mesmo
  `writeset.py persist`.
- D5 Ler também a disponibilidade da Gupy (página pública). Site de carreiras continua com "Confirmei que está aberta".
- D6 A lista e o horário ficam num arquivo de estado do job-search, lido por um comando novo do `dispatch.py`. A
  planilha não muda de esquema (`prioridade_sort` e `próxima_ação` são colunas-fórmula).
- D7 Vagas que saem da lista vão para a seção "Fora da lista" (recolhida, com motivo). Nada muda na planilha por isso.
- D8 Teto de 10 análises novas no ChatGPT por clique (2 lotes). O que sobrar fica para o próximo clique.
- D9 Nome do botão: "Atualizar lista".
- D10 Entram as 4 correções do Cotar vagas: abrir o Chrome do portal sozinho (com mensagem clara), mais resultados
  (2 páginas, 2 semanas), limpar textos velhos, buscas num arquivo versionado.
- D11 O "Cotar vagas" continua em /cotar (só traz e analisa novas, writeset + "Registrar na planilha" como hoje).

## Desenho

### job-search

- Ação nova `ATUALIZAR_LISTA` (host, `hermes_only`, `per_job: False`), filho `_today` registrado em `HOST_CHILDREN`
  (lição 2026-10-02: o liveness deriva da mesma tabela). Recusa só `DISPATCH_ACTIVE` (outro Atualizar rodando). Não
  recusa por cotação ou análise rodando (decisão 2026-10-14: fila, nunca recusa).
- `run_today` (etapas no registro, `progress` com etapas e contagens):
  1. `planilha`: lê a aba principal (só leitura) e a lista atual.
  2. `disponibilidade`: relê a disponibilidade das vagas da lista atual e das candidatas `SELECIONADA`: LinkedIn pela
     página guest (já existe), Gupy pelo leitor novo; site de carreiras fica como está. Mudança vai para o writeset
     com reconciliação `HOST_RECHECK <data>` (valor antigo guardado; o usuário corrige com confirm-open/mark-closed).
  3. `busca`: `job_discovery.search` (a mesma do Cotar vagas). Falha da descoberta não para o resto; o código fica
     no registro.
  4. `selecao`: candidatas = linhas da planilha não enviadas/retiradas/descartadas pelo usuário. Já elegíveis:
     `SELECIONADA` + `ABERTA` + dossier válido do host. Precisam de análise: as `SELECIONADA` + `ABERTA` sem dossier
     válido do host (as 4 de 22/09) e as novas da busca. Ordem para gastar o teto de 10: primeiro as que já estão
     na Hoje sem análise, depois as novas (zona prioritária, mais recentes, mesma ordem do `job_discovery`).
  5. `chatgpt`: `job_analysis` em lotes de 5 pelo `chatgpt_exchange` (fila flock, High conferido a cada envio).
     Linha registrada usa o texto de `registered_posting` e o UPSERT de `reanalysis_row`; vaga nova usa o caminho de
     `Analysis.run`. Vaga registrada sem texto disponível fica fora com motivo `POSTING_UNAVAILABLE`.
  6. `registro`: um writeset só (análises + disponibilidade) → `writeset.py check` VALID → `writeset.py persist`
     (timeout e backoff do `_persist`). Falhou: PRECISA_HUMANO com o writeset no op_dir e "Registrar na planilha"
     como retomada; a lista não é trocada.
  7. `lista`: elegíveis ordenadas por D3, as 5 primeiras. Grava `$STATE/today-list.json` (0600, atômico):
     `{schema: "today-list/1", updated_at, dispatch_id, items: [{job_id, interesse, motivo}],`
     `left: [{job_id, motivo}]}`. Motivos de saída: `ENCERRADA`, `REANALISADA_<status>`, `INTERESSE_MENOR`, `A_CONFIRMAR`
     (disponibilidade), `SEM_ANALISE` (passou do teto). Menos de 5 elegíveis: a lista fica menor e o registro diz
     quantas faltaram.
- `dispatch.py today`: devolve o arquivo (ou `{"list": null}`), sem ler a planilha.
- Gupy: `job_discovery.availability` passa a reconhecer `*.gupy.io/jobs/<id>` pela URL ou pela fonte, nunca pelo
  formato do id (lição 2026-10-02), e lê a página pelo Chrome do portal. O sinal de "encerrada" sai de um spike numa
  vaga aberta e numa encerrada conhecidas, antes do código.
- Cotar vagas:
  - `job_discovery.ensure_browser()` com `native_profiles.sh ensure portal` e `graphical_session.session_env`, chamado
    no começo da busca. `dispatch.py open-browser portal` para o botão de retomada.
  - Descoberta fora do ar com backlog vazio: PRECISA_HUMANO com o código da descoberta e `progress.recovery`
    ("Abrir navegador do portal" e tentar de novo), no lugar de FALHOU.
  - Buscas em `methodology/discovery-searches.json` (versionado, validado: fonte, termo, local, máximo de entradas),
    lidas pelo `job_discovery`. Mesmo conteúdo das 9 buscas atuais no primeiro commit.
  - LinkedIn: 2 páginas por busca e `f_TPR` de 14 dias. O passo do `start` é conferido no teste com a página real
    salva (sem repetir card).
  - `command_text` do BUSCAR_VAGAS no Hermes descreve o pipeline do host (sem Threadgist/message_agent);
    docstring e RUNTIME.md alinhados.
- Docs: `methodology/job-analysis.md` (shortlist de 5 = lista da Hoje, como o Atualizar escolhe) e o docstring do
  `dispatch.py`.

### Painel

- `lib/ops/schema.ts`: `ATUALIZAR_LISTA` nas ações; schema do `today` (`today-list/1`).
- `lib/ops/present.ts`: `ACTION_META.ATUALIZAR_LISTA`, etapas, motivos legíveis; descrição do BUSCAR_VAGAS sem o
  texto velho.
- `lib/job-search/present.ts`: `todayQueue(items, list)`. Com lista: vagas da lista que ainda estão elegíveis
  (`jobState` aberta/revisão, não enviada), na ordem da lista; o resto da fila antiga vai para `outOfList` com o motivo.
  Sem lista (primeiro uso): comportamento atual.
- Hoje (`app/(dashboard)/page.tsx`): botão "Atualizar lista" ao lado de "Sincronizar" (desativado só com o próprio
  Atualizar rodando). Enquanto roda, mostra a etapa (poll do disparo); ao terminar, `router.refresh()` e a lista nova
  na mesma página. Linha "Lista atualizada em 16/10 às 14:30 · há 2 h". Seção recolhida "Fora da lista · N" com os
  motivos.
- /cotar: "Buscar vaga específica" deixa de travar durante a cotação do host. Retomada "Abrir navegador do portal"
  no card do BUSCAR_VAGAS e do ATUALIZAR_LISTA.
- Fake do e2e (`e2e/fixtures/job-search-fake`): `start ATUALIZAR_LISTA`, `today`, `open-browser portal`.

## Plano (cada item = um commit; teste vermelho antes da implementação)

### job-search

- [x] J0 Spikes sem efeito: (a) o portal 9223 hoje é o Chrome nativo (`job-search-browser.desktop`) ou o pod
      `jsb-portal`? (b) sinal de encerrada da Gupy: baixar com `curl` para o scratchpad a página pública de uma vaga
      aberta e de uma encerrada já conhecidas, parsear com `python3 -I`; (c) passo de paginação do LinkedIn guest.
      Sem abrir Chrome, sem ChatGPT.
- [x] J1 `feat(discovery): read the searches from a versioned file`.
- [x] J2 `feat(discovery): read two result pages over two weeks`.
- [x] J3 `feat(discovery): open the portal browser when it is closed` (+ `open-browser portal`, teste pelo `main(argv)`).
- [x] J4 `fix(dispatch): ask the user when the search has nothing to analyse` (PRECISA_HUMANO + recovery).
- [x] J5 `docs(dispatch): describe the host search without the Threadgist`.
- [x] J6 `feat(discovery): read Gupy availability`.
- [x] J7 `feat(analysis): reanalyse registered rows in batches`.
- [x] J8 `feat(dispatch): refresh the Hoje list` (ATUALIZAR_LISTA, `_today`, `today-list.json`, `dispatch.py today`;
      testes de cada etapa com stubs, liveness com processo real do argv, `main(argv)` com o argv exato do painel).
- [x] J9 `docs(methodology): the Hoje list is the operational shortlist`.

### Painel

- [x] P1 `fix(ops): the host search no longer blocks the specific-job search`.
- [x] P2 `feat(ops): describe the Hoje list refresh` (schema, ACTION_META, server actions `refreshTodayList`,
      `getTodayList`, fake do e2e).
- [x] P3 `feat(today): queue from the refreshed list` (`todayQueue` com lista, "Fora da lista"; vitest).
- [x] P4 `feat(today): Atualizar lista button and last update` (botão, etapa, horário; e2e sem reload).
- [x] P5 `feat(ops): open the portal browser from the search card` (retomada; e2e).

### Verificação

- [ ] Gates job-search: `python3 scripts/validate_job_search.py`; `python3 -m unittest discover -s scripts -p 'test_*.py'`
      (base 683 OK); `python3 -m pytest -q hermes/browsers` (base 442 passed + 12 falhas antigas: comparar);
      `ruff check` nos arquivos tocados; `git diff --check`.
- [ ] Gates painel: `pnpm exec tsc --noEmit`; eslint e prettier nos arquivos tocados; `pnpm exec vitest run` (base
      282); e2e de ops.spec + dashboard.spec numa cópia na porta 3005 (fixture + fake, baseURL `localhost:3005`, sem
      webServer). Base: 32 passam e 4 falham. O teste "cotar vagas: as que ficaram de fora" já falha: investigar antes
      de mexer nele.
- [ ] E2E do "Atualizar lista": clique → etapas → lista nova e horário na mesma página, sem reload, com o `progress`
      completo (lição 2026-10-16).
- [ ] Rodada real (só com OK do usuário: abre o Chrome do portal, manda até 10 vagas ao ChatGPT e grava a planilha).

## Execução (2026-10-16)

- J0: portal 9223 = Chrome nativo (perfil `job-search`, `native_profiles.sh ensure portal` já existia). Gupy:
  `__NEXT_DATA__` → `job.status` + `job.registerEndDate` (MRV&CO 12484524 aberta, Mercantil 12614985 com inscrição até
  06/10 → encerrada, igual ao que o usuário marcou). LinkedIn guest: 10 cards por chamada; `start=10` traz 7 novos.
- job-search (main, sem push): 59bf496 J1, 964923d J2, 807c102 J3, 459b399 J4, 8d36e21 J5, a5eb5f8 J6, 04fc751 J7,
  7ce0c60 J8, cf73e44 J9, 8dcb105 (extra, abaixo).
- Desvios do desenho:
  - O próprio dispatcher recusava a vaga específica com `PROFILE_BUSY` durante a cotação do host (o registro guarda
    `profile=jobsearchportal` em qualquer modo). Corrigido no job-search (8dcb105), não só no painel.
  - J4 sem `progress.recovery`: o código (`BLOCKED_DISCOVERY_CDP`) basta; o painel mostra o texto e o botão "Abrir
    navegador do portal" pelo código. Descoberta no ar sem nada novo agora termina CONCLUIDO `NOTHING_NEW`.
  - A falha antiga do e2e "cotar vagas: as que ficaram de fora" era a asserção da trava global do ChatGPT removida em
    2026-10-14 (esperava "Cotar vagas" desativado durante uma análise). Asserção corrigida.
  - O card do Atualizar lista fica na Hoje depois de terminar (até "Fechar"), para mostrar etapas e contagens.

## Fora do escopo

- Leitor de disponibilidade de site de carreiras (continua "Confirmei que está aberta").
- Mudar o esquema da planilha ou as colunas-fórmula.
- Reanalisar vaga que já tem análise válida do host (só disponibilidade é relida).
