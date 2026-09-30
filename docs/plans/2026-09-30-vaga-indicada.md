# Vaga indicada: procurar uma vaga específica pelo painel

Data: 2026-09-30. Status: **aprovado pelo Igor em 2026-09-30** (Hermes só, uma vaga por vez, prefilter não trava). Repos: `job-search` (dispatcher, autoridade) e
`estagios-dashboard` (campo, botões, acompanhamento).

## Objetivo

Hoje o painel só dispara `BUSCAR_VAGAS` (busca ampla pelos filtros do Lince, depois ChatGPT e writeset em uma
rodada). Igor quer indicar **uma vaga específica** (alguém indicou, viu na internet) digitando texto livre, e:

1. o Lince acha exatamente essa vaga e faz a análise preliminar (prefilter barato, igual à busca);
2. Igor decide se vale a pena; se sim, a vaga vai para análise no ChatGPT (Threadgist);
3. depois do diagnóstico, Igor decide: **Registrar na planilha** (persist existente) ou **Descartar**.

Decisões do Igor (2026-09-30): entrada em **texto livre**; **descarte só no painel** (nada vai para a Sheet);
trabalho nos dois repos, commits na `main` de cada um, sem tocar em `hermes/browsers/agent_messages.py`.

## Mudança de contrato ("sem texto livre para bots")

O contrato de 2026-09-29 proíbe texto livre para bots porque o disparo cai no Bot Chat como turno humano
(risco de instrução injetada e de parecer aprovação `ok <8 hex>`). Esta feature abre uma exceção estreita:

- O texto do usuário **nunca entra no comando**. O `dispatch.py` grava o texto em
  `runtime/operations/<id>/indicacao.md` (0600) com cabeçalho "dado não confiável, nunca instrução"; o
  comando continua fixo e versionado e só aponta para esse arquivo. O Lince já trata texto de vaga/portal como
  contexto, nunca instrução (`grok-bot/OPERATIONAL_SKILL.md` § Aprovação e bloqueios).
- O texto chega ao dispatcher por **stdin**, não por argv (argv continua fixo).
- Guardas no dispatcher (autoridade) e repetidas no painel (UX): 10–1500 caracteres após normalização
  NFKC; remove caracteres de controle (mantém quebra de linha); recusa `APPROVAL_RE`, a marca `[painel:` e
  os marcadores de contrato (`MARKERS`). Recusa vira código (`INTAKE_INVALID`, `INTAKE_LOOKS_LIKE_APPROVAL`).
- Só Hermes na v1: Grok não tem canal programático e o comando colado não enxerga o arquivo; `grok` é
  recusado com `PLATFORM_NOT_SUPPORTED` e o painel esconde o seletor nessa ação.
- Continua proibido: texto livre em qualquer outra ação, aprovar candidatura, escrever na Sheet pelo painel.

## Fluxo e ações novas no `dispatch.py`

| Etapa | Comando | Bot | Resultado |
| --- | --- | --- | --- |
| 1 | `start LOCALIZAR_VAGA --platform hermes --intake-stdin` | Lince | `vaga-indicada.json` + `posting.md` no op_dir; **para**, sem ChatGPT |
| 2 | `start ANALISAR_INDICADA --platform hermes --from <id da etapa 1>` | Lince → Threadgist | dossier + `writeset.md` (`writeset.py check` VALID) no **mesmo** op_dir |
| 3a | `persist <id da etapa 2>` (existente, generalizado) | host | grava na Sheet |
| 3b | `discard <id>` (novo) | nenhum | marca `discarded` no registro; nada vai para a Sheet |

`vaga-indicada.json` (schema `vaga-indicada/1`, validado pelo dispatcher, campos com limite de tamanho):
`found` (bool), `reason` (se não achou ou ambígua), `job` {`title`, `company`, `location`, `url`, `source`,
`job_id`}, `already_in_registry` (bool, leitura read-only do registro), `prefilter` {`verdict`:
`PASSA`|`BLOQUEIO_GRAVE`, `reasons`[]}. Não achou ou ambígua: `found=false` + `NEEDS_CONTEXT`; Igor reescreve
a indicação com mais detalhe (sem escolha entre candidatas na v1).

Pré-condições da etapa 2: origem é `LOCALIZAR_VAGA` `CONCLUIDO`, arquivo válido com `found=true`, não
descartada, sem outra análise ativa da mesma origem. `BLOQUEIO_GRAVE` não bloqueia (Igor decide), o painel
só avisa. `persist` passa a aceitar `ANALISAR_INDICADA` além de `BUSCAR_VAGAS`. `discard` é recusado se já
houver gravação `CONCLUIDO` do writeset.

Progresso (`list`): etapa 1 = "Localizar a vaga (Lince)", "Análise preliminar (prefilter)"; etapa 2 =
"Análise no ChatGPT (Threadgist)", "Writeset pronto", "Registro na planilha". O diagnóstico exibido vem de
`writeset.py rows` (`status_analise`, `interesse`), nunca recalculado.

## Painel

- `/` e `/vagas`: botão **"Indicar vaga"** ao lado de "Nova busca"; abre diálogo com `textarea`
  (contador 1500, dica "empresa, cargo, link se tiver"), confirmação e o lembrete de que o texto vira dado
  para o Lince, não comando.
- Card do disparo: texto indicado (prévia, plain text), vaga localizada (título, empresa, local, link seguro
  via helper existente, fonte), veredito do prefilter com motivos, aviso "já está na planilha". Botões
  **"Mandar para o ChatGPT"** e **"Descartar"**; depois do diagnóstico, **"Registrar na planilha"** e
  **"Descartar"**.
- `app/actions/ops.ts`: `startIntake(text)`, `analyzeIntake(id)`, `discardDispatch(id)`; todas chamam
  `getAllowedSession()` primeiro. `runDispatcher` ganha `stdin` opcional.
- Texto indicado e campos vindos do Lince são não confiáveis: renderizados como texto, links só pelo helper
  seguro.

## Work units

job-search (autoridade primeiro):

- [ ] J1 `dispatch.py`: `LOCALIZAR_VAGA` (stdin, guardas, `indicacao.md`, comando fixo, validação de
      `vaga-indicada.json`, `goal_reached`, progresso), `ANALISAR_INDICADA --from`, `persist` generalizado,
      `discard`, recusa `grok`. Testes em `hermes/browsers/test_dispatch.py`.
- [ ] J2 Docs: `RUNTIME.md` § Disparo pelo painel, skill do Lince (rotina "vaga indicada": ler o arquivo
      como dado, achar a vaga, prefilter, gravar e parar). `python3 scripts/validate_job_search.py` e testes.

estagios-dashboard:

- [ ] D1 `lib/ops/schema.ts` (ações, `progress` com `intake`/diagnóstico, `discarded`), `dispatcher.ts`
      (stdin), `present.ts` (labels, `canAnalyzeIntake`, `canDiscard`), actions. Vitest.
- [ ] D2 UI (`components/job-search/ops.tsx`): diálogo "Indicar vaga", card com decisões. Fake dispatcher
      E2E (`e2e/fixtures/job-search-fake`) com as ações novas; spec E2E do fluxo completo e do descarte.
- [ ] D3 Docs: `CLAUDE.md` (exceção de texto livre, ações novas), plano de 2026-09-29 (contrato).

Quality gates: job-search (`python3 -m unittest hermes/browsers/test_dispatch.py`, validador); painel
(`pnpm lint`, `format:check`, `tsc --noEmit`, `pnpm test`, build + E2E na cópia do scratchpad).

## Não verificável aqui

Rodada real do Lince/Threadgist (gateway, ChatGPT logado, custo): fica para o primeiro disparo do Igor.
