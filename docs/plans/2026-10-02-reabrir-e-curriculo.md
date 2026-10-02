# Reabrir vaga ENCERRADA e currículo sem trava de disponibilidade (2026-10-02)

Caso: vaga 12478822 (Gupy, indicada, NÃO PRIORIZADA) ficou ENCERRADA com a vaga aberta: o job-search lia a página
do LinkedIn para qualquer job_id numérico. Plano completo e decisões do usuário no job-search:
`.agents/plan-reopen-and-cv-gate-20261002.md` (job-search é a autoridade).

Decisões: "Gerar currículo" depende só da análise feita (dossier VALID, qualquer veredito e disponibilidade; Grok
continua com a trava antiga); "Preencher vaga" segue exigindo SELECIONADA e ABERTA; "Confirmei que está aberta"
aparece também em ENCERRADA (mesmo `confirm-open`, reconciliação USER_CONFIRMED com o valor antigo).

- [x] job-search: causa raiz, confirm-open com ENCERRADA, CV no host só com dossier VALID, `job.cv_allowed`, docs
- [x] painel: `jobCvBlocker`, `startDispatch` por ação, `JobOps` com `cv_allowed`, `canConfirmOpen` com ENCERRADA e
      diálogo de reabrir, sem texto JOB_CLOSED
- [x] fixture: fake-1010 (NÃO PRIORIZADA, ENCERRADA, Gupy) pelo gerador; fake dispatcher com `cv_allowed`
- [x] gates: pnpm test (203), tsc, lint (2 warnings antigos), format:check, e2e 30/30 na cópia 3108
- [ ] `confirm-open 12478822` só com OK do usuário
