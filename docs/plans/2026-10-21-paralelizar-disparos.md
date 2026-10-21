# Paralelizar disparos: preencher durante o currículo e fila de candidaturas (2026-10-21)

Pedido do usuário (2026-10-21): desvincular os processos para que rodem em paralelo. Caso concreto: com "Edição do
currículo" rodando na vaga 4480187478, "Preencher vaga" foi recusado com `CV_JOB_BUSY` ("O currículo desta vaga já
está sendo gerado ou editado: espere terminar.").

Repositórios: job-search (`/home/plasma-test/Projetos/job-search`, main e074e0a) e painel (este, main 422efbd).
Commit direto na main, uma preocupação por commit, sem push até o OK do usuário.

## Estado encontrado (só leitura)

Quem recusa é o job-search (`hermes/browsers/dispatch.py`, `preconditions()`); o painel só mostra o código.

| Regra                                                                 | Código                        | Efeito hoje                                                        |
| --------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Renderer local: `PREENCHER_CANDIDATURA` está em `CV_RENDERER_ACTIONS` | `CV_JOB_BUSY`                 | Preencher recusado enquanto a mesma vaga gera/edita currículo      |
| Um `PREENCHER_CANDIDATURA` ativo por vez (qualquer vaga)              | `APPLICATION_DISPATCH_ACTIVE` | Segunda candidatura recusada                                       |
| Mesma ação + mesma vaga                                               | `DISPATCH_ACTIVE`             | Mantida                                                            |
| Carta: gerar/editar na mesma vaga                                     | `LETTER_JOB_BUSY`             | Mantida                                                            |
| ChatGPT                                                               | —                             | Já tem fila (2026-10-14, `chatgpt_exchange`, teto 4), nunca recusa |
| Currículos de vagas diferentes (renderer local)                       | —                             | Já em paralelo                                                     |

Achados que mudam o desenho:

- A trava só vale enquanto o bot trabalha (`_blocking` = PENDENTE/RODANDO ou INCERTO não reconhecido). Edição em
  `CHANGES_PENDING` (esperando aprovação) e preenchimento em `FILL_PENDING` não travam nada.
- O currículo entra no preenchimento em dois pontos: `claude_application.prepare` (gera se faltar, antes de abrir a
  vaga) e `claude_fill.Filler._attach` (gera se faltar e anexa o PDF de `cv.json`). Os dois chamam `make_cv` só quando
  `cv_export.verify` falha. Com uma geração em curso, hoje rodaria uma **segunda** geração.
- Com o renderer `claude_design` não há `CV_JOB_BUSY`: um preenchimento com currículo pronto já pode começar durante
  uma edição e anexa a versão velha. O mesmo ponto de espera resolve os dois renderers.
- Registro PENDENTE sem processo vivo vira INCERTO (`_effective`, `HOST_PROCESS_GONE`). Uma fila precisa de processo
  vivo esperando ou de exceção explícita.
- `answer_fill` reinicia o filho `_fill` sem conferir se outra candidatura está rodando: hoje duas rodadas podem rodar
  juntas no mesmo Chrome.

## Decisões do usuário (2026-10-21)

- D1 O anexo durante uma edição espera a versão nova.
- D2 A segunda candidatura entra em fila automática.
- D3 "Tirar da fila" entra junto; 30 min de espera pelo currículo.

## Desenho

### Parte 1: preencher sem esperar o currículo (D1)

1. `preconditions()`: `PREENCHER_CANDIDATURA` sai da checagem `CV_JOB_BUSY`. Gerar e editar a mesma vaga continuam
   exclusivos entre si.
2. `dispatch.py` passa ao fluxo de preenchimento um `cv_busy(job_id)`: existe GERAR_CURRICULO/EDITAR_CURRICULO
   bloqueante (`_blocking`) desta vaga, ou EDITAR_CURRICULO em `CHANGES_PENDING` não reconhecido?
3. Espera antes de usar o currículo, nos dois pontos (`prepare` e `_attach`):
   - bot rodando (gerando/editando): o filho espera (etapa `cv_wait`, consulta a cada 3 s, teto 30 min) e depois
     confere `cv.json` de novo. Só gera se ainda faltar;
   - edição parada esperando sua aprovação: não espera indefinidamente. Em `_attach` o campo de currículo vira
     pendência: "Uma edição do currículo espera sua decisão. Decida no card do currículo e clique em Feito aqui; o
     sistema anexa a versão nova." Na rodada seguinte o anexo é tentado de novo (se a edição ainda estiver pendente,
     a pendência volta);
   - teto de 30 min estourado: pendência "O currículo ainda está sendo editado…" no mesmo formato.
   - Em `prepare` (antes de abrir a vaga) só a espera do bot rodando; edição pendente não impede abrir a vaga, porque
     o anexo acontece depois, em `_attach`.
4. O registro do preenchimento mostra a etapa `cv_wait`; o painel ganha o rótulo "Aguardando o currículo terminar".

Fora do escopo: uma edição iniciada **depois** que o currículo já foi anexado. O anexo não é refeito sozinho
(continua como hoje).

### Parte 2: fila de candidaturas (D2)

Mesmo padrão do ChatGPT: o processo filho nasce na hora e espera a vez, sem recusar e sem promotor externo.

1. `preconditions()`: `APPLICATION_DISPATCH_ACTIVE` deixa de recusar `PREENCHER_CANDIDATURA` pelo Hermes (Grok sem
   mudança). `DISPATCH_ACTIVE` (mesma vaga) continua.
2. Vaga de candidatura = `flock` em `$STATE/application-fill.lock`, pego pelos filhos `_apply` e `_fill` (inclusive a
   rodada que `answer_fill` reinicia) e solto quando o processo termina (pendência, pronto, falha ou queda).
   Ordem: o filho só pega a vaga se for o registro mais antigo esperando (`created_at`), para a fila ser na ordem dos
   cliques.
3. Esperando: status PENDENTE, etapa `queued`, processo vivo (não vira INCERTO). `progress.application_queue` =
   posição e a vaga que está na frente (só o `job_id`; o painel põe empresa e cargo pela planilha).
4. "Tirar da fila" no card na fila: `dispatch.py cancel <id>` só aceita PREENCHER_CANDIDATURA em `queued`; encerra o
   filho e marca PARADO `CANCELLED_BY_USER`, reconhecido.
5. Painel: PENDENTE já aparece como "Na fila". O card mostra "Começa quando a candidatura de <empresa> terminar ou
   parar esperando você" e o botão "Tirar da fila"; "Em andamento" lista o item como rodando/na fila (como já faz com
   PENDENTE).

## Passos

Job-search (testes em `hermes/browsers/test_dispatch.py`, `test_claude_fill.py`):

- [x] J1 `cv_busy` + espera em `prepare`/`_attach`, pendência para edição esperando aprovação ou teto estourado;
      `PREENCHER` fora do `CV_JOB_BUSY`. Testes: espera e anexa a versão nova; não gera duas vezes; pendência com
      edição em CHANGES_PENDING; teto.
- [x] J2 Fila: lock de candidatura em `_apply`/`_fill`, ordem por `created_at`, etapa `queued`, fim de
      `APPLICATION_DISPATCH_ACTIVE` no Hermes, `progress.application_queue`. Testes: segundo disparo aceito e esperando;
      começa quando o primeiro solta; rodada de `answer_fill` espera a vaga; filho morto solta a vaga.
- [x] J3 `dispatch.py cancel <id>` (só fila). Testes: cancela na fila; recusa rodando/outra ação.
- [x] J4 Docstring do `dispatch.py` e `methodology/` se citarem "uma candidatura por vez".

Painel:

- [x] P1 `schema.ts`: `progress.application_queue` opcional; rótulos `cv_wait`/`queued` em `present.ts`.
- [x] P2 Card na fila: texto com empresa da vaga na frente + "Tirar da fila" (`cancelDispatch` em
      `app/actions/ops.ts`, com `getAllowedSession()`; `refusalText` para os códigos novos).
- [x] P3 Fake dispatcher do E2E (`e2e/fixtures/job-search-fake`) com fila e `cancel`; E2E do card na fila.
- [x] P4 CLAUDE.md (seção de bot dispatch).

Verificação: `python3 -m unittest` no job-search; `pnpm lint`, `pnpm format:check`, `pnpm exec tsc --noEmit`,
`pnpm test`, `pnpm test:e2e`, `pnpm build` no painel; prova manual com o dispatcher real: editar currículo de uma vaga
e preencher a mesma (anexa o PDF `-v2`); dois "Preencher vaga" seguidos (o segundo fica na fila e começa sozinho).
