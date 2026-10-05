# Candi: README de portfólio, prints e entrada no currículo

Data: 2026-10-05. Pedido: reformular o GitHub do projeto como **Candi — central do candidato**, com README que apresente o autor para vagas de dados, dashboards, automação e coordenação de bots; prints para o LinkedIn; e o projeto entre os projetos do currículo (job-search).

## Regras

- Só fatos verificáveis no código. O painel não usa SQL nem banco; não há deploy nem usuários além do dono; nenhuma métrica inventada.
- Prints só com dados da fixture (`lib/job-search/fixtures/snapshot.json`), sem e-mail, nome real ou Sheet ID.
- Servidor do usuário na porta 3000 intocado; prints numa cópia no scratchpad, `next start -p 3108`, host `localhost`.
- Nenhum bot real, nenhuma escrita na Sheet. Push, PR, renomear o repo e mudar About/topics ficam com o usuário.
- Docs antigos (`docs/VERCEL_DEPLOYMENT.md`, planos de 2025) não são alterados sem perguntar.

## Checklist

- [x] Plano (este arquivo) mostrado ao usuário.
- [x] Prints: cópia (rsync sem `.next`, `node_modules`, `.env*`, `.git`, `e2e/.fake-dispatch-state`), `pnpm install --offline --frozen-lockfile`, `next build`, `next start -p 3108` com env de `e2e/auth.ts` e `e2e/ops-env.ts`; cookie de `signInAs()`; Playwright descartável na cópia.
- [x] Capturar `/`, `/analise`, `/vagas`, uma `/vaga/[job_id]`, `/cotar` (escuro, desktop) e `/` no tema claro; conferir que não há dado pessoal; PNG otimizado em `docs/screenshots/`.
- [x] README: Candi, "central do candidato", problema, diagrama, destaques técnicos (Sheets somente leitura com zod e sha256 do dossier; KPIs e funil em `/analise`; dispatcher com `execFile`, argv fixo e env mínimo; texto livre só por stdin com guardas; auth fail-closed em três portões; local-first; Vitest + Playwright com dispatcher falso; CI), como rodar com a fixture, stack, prints. Sem Supabase, Vercel, IA no painel ou "Estágios".
- [x] Gates do painel: `pnpm format:check`, `pnpm lint`.
- [x] Commits: `docs(screenshots): ...`, `docs(readme): ...`, `docs(plans): ...`.
- [x] job-search: entrada `CANDI` (`PROJETO_PESSOAL`) em `knowledge/experience.json`, linha em `knowledge/skills-evidence.md` ("## Projetos"); `capabilities.json` só se alguma competência nova colidir com ausência confirmada (hoje não colide).
- [x] Gates do job-search: `python3 scripts/validate_job_search.py`, `python3 -m pytest -q` (12 falhas pré-existentes conhecidas).
- [x] Commit `docs(knowledge): ...` no job-search.
- [x] Textos sugeridos (About, topics, LinkedIn) entregues ao usuário, sem executar.

## Resultado

- Painel: `7810901` docs(screenshots) (6 PNG em `docs/screenshots/`, 556 KB, pngquant), `0227b2e` docs(readme). `pnpm format:check` ok; `pnpm lint` só os 2 warnings conhecidos. Sem mudança de código, sem tsc/testes.
- Prints: cópia no scratchpad, build de produção, `next start -p 3108`, fixture + dispatcher falso; `/cotar` mostra uma cotação do dispatcher falso. Conferidos visualmente: só dados da fixture. Servidor da cópia parado pelo PID; a porta 3000 do usuário não foi tocada.
- job-search: `f695c33` docs(knowledge), entrada `CANDI` (`PROJETO_PESSOAL`). `validate_v1_knowledge_model` sem erros; `validate_job_search.py` completo falha só num arquivo ignorado em `runtime/` (âncora `job-preferences.md#regime--tipo-de-contrato`), pré-existente e fora do escopo; pytest 814 passed, 12 failed (as conhecidas em test_tool_surface, test_agent_messages, test_runtime_policy).
- Pendente com o usuário: push dos dois repos, renomear o repo no GitHub, About e topics.
