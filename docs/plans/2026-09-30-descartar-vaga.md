# Descartar vaga pelo painel

Data: 2026-09-30. Status: implementado (dashboard `feat/discard-job`, job-search `feat/decline-job`).

## Pedido

Escolher pelo dashboard em quais vagas se candidatar. Uma vaga descartada continua listada, com o mesmo símbolo
da candidatura enviada (ícone de envio), em vermelho, e o carimbo "DESCARTADA" no lugar de "feito".

## Decisões (Igor, 2026-09-30)

- Persistência na Sheet, pelo job-search: `status_candidatura = RETIRADA`, que o `registry.md` já mapeia para
  `CLOSED (USER_DECLINED)`. Descartado: `status_analise = DESCARTADA` (é o veredito da análise; reanálise
  sobrescreveria) e marca só local (a Sheet deixaria de ser a fonte de verdade).
- Sem desfazer nesta versão: `CLOSED` é terminal no Application Operator.

## Contrato

- job-search `application.py decline <job_id>`: sem `claim`, sem dossier, sem lock novo. Recusa `ENVIADA`
  (`ALREADY_SENT`), `ENVIO INCERTO` (`SUBMIT_UNCERTAIN`), `RETIRADA` (`ALREADY_DECLINED`), linha ausente
  (`ROW_NOT_FOUND`) e tentativa em `SUBMITTING`/`SUBMIT_UNCERTAIN`/`SUBMITTED` (`WRONG_STATE`). Grava em modo
  strict o evento `CLOSED` com `evidencia = USER_DECLINED` e `RETIRADA`, com releitura. Repetir é seguro.
- job-search `dispatch.py decline <job_id>`: síncrono (timeout 25 s), argv fixo, recusa `JOB_DISPATCH_ACTIVE` com
  currículo ou candidatura desta vaga em andamento; responde só `{job_id, status_candidatura}` ou um código
  (`DECLINE_UNCERTAIN` no timeout, `DECLINE_FAILED` para saída inesperada).
- Painel: `declineJob(jobId)` (sessão primeiro, `JOB_ID_RE`, `updateTag` sempre, porque uma escrita incerta pode ter
  chegado). Botão "Descartar vaga" com confirmação no detalhe e nos cards da fila "Hoje"; estante "Descartadas por
  você" no "Hoje". Estado visual `descartada` = RETIRADA cujo último `CLOSED` tem `USER_DECLINED`; as outras
  RETIRADA (vaga encerrada, não elegível) continuam `retirada`.

## Verificação

- job-search: testes de `application.py decline` e `dispatch.py decline` (Sheet fake), suíte + `validate_job_search.py`.
- Painel: unitários (estado, gating, action), e2e com o fake dispatcher e a vaga `fake-1009` da fixture
  (RETIRADA + `CLOSED`/`USER_DECLINED`), screenshots claro/escuro/mobile num `next start` isolado (porta 3100).
- Não verificado: escrita na Sheet real (fica para o primeiro descarte real, com autorização do Igor).
