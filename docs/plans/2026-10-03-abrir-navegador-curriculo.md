# Abrir navegador do currículo (2026-10-03)

Problema: em `/vaga/[job_id]`, "Gerar currículo" pelo Hermes recusa com `CLOUDDESIGN_CDP_DOWN` quando o Browser C
(Chrome nativo do perfil cloud-design, CDP 9226) está fechado; só o atalho Cloud Design Browser o abria. Decisão do
usuário: um botão que pede ao job-search para abrir esse Chrome. Login no Claude e painel do Claude nas abas PT/EN
continuam manuais; nenhuma credencial passa pelo painel.

- [x] job-search: `dispatch.py open-browser clouddesign` (só esse nome, sem argumento livre) roda
      `native_profiles.sh open clouddesign` com timeout de 20 s e depois o `check`; já aberto com CDP não faz nada.
      As variáveis de sessão gráfica que faltam vêm de `systemctl --user show-environment` (allowlist `SESSION_ENV`),
      então o `PASSTHROUGH_ENV` do painel não muda. Plano do lado de lá: `.agents/plan-open-browser-20261003.md`.
- [x] `openBrowserResultSchema` (`browser`, `already_open`) e `openCvBrowser()` em `app/actions/ops.ts`
      (`requireSession()` primeiro, argv fixo, nenhum input do cliente)
- [x] textos de `BROWSER_INVALID`, `NO_GRAPHICAL_SESSION`, `CLOUDDESIGN_OPEN_NO_CDP`, `CLOUDDESIGN_OPEN_FAILED`;
      `CLOUDDESIGN_CDP_DOWN` aponta para o botão
- [x] botão "Abrir navegador do currículo" no diálogo "Gerar currículo", só com Hermes (a seção só existe com o
      disparo habilitado), com carregando, erro e o aviso do que falta fazer à mão
- [x] toast de `CLOUDDESIGN_CDP_DOWN` (Gerar currículo, Pedir edição) com a ação "Abrir navegador"; o diálogo de
      disparo fecha antes, porque o modal bloqueia o clique no toast
- [x] fake do e2e responde `open-browser clouddesign`
- [x] testes unitários (action e textos), tsc, lint, format; conferência visual em cópia na porta 3108
- [x] ramo que abre o Chrome de fato (2026-10-04): com o Chrome fechado, `open-browser clouddesign` com env mínimo
      igual ao do painel abriu o Chrome em 5 s (`already_open: false`, CDP 9226 no ar) e o login no Claude continuou
      (conferido pelo usuário). O clique no painel real da 3000 não foi testado (login Google); o caminho do painel até
      o comando foi conferido na cópia da 3108.
