# Preencher vaga com pendências no painel (2026-10-08)

Decisão do usuário: o Claude in Chrome (assinatura) é o operador da candidatura; só documentos (CPF, RG e afins)
ficam fora do Claude. O sistema preenche tudo o que pode e o painel mostra o que falta, um campo por informação,
com "Enviar" (ou "Feito" para algo feito na página). Cada envio vira ✓; sem pendência aberta, o job-search faz a
rodada seguinte. Fim em `READY_TO_SUBMIT`: o usuário revisa e clica no envio final.

- job-search: `hermes/browsers/claude_fill.py` (rodadas no painel do Claude, `CANDI_STATUS`, CPF/RG pelo host,
  anexo do PDF), `dispatch.py answer <id> --item N [--value-stdin]`, filho `_fill`.
- Painel: `progress.fill` (zod `fillSchema`), `answerFill` (stdin, nunca argv), `FillPending`/`FillItemRow` em
  `components/job-search/ops.tsx`, textos em `lib/ops/present.ts`.
- Documento digitado no painel vai só para o private store do job-search; nenhuma resposta volta ao painel.
- Abrir o painel do Claude na aba da vaga continua manual (gesto do Chrome); se estiver fechado, vira pendência
  "Feito".
