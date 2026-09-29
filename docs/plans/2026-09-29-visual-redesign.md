# Redesign visual "Caça" (2026-09-29)

Objetivo: o painel deixa de ser relatório e vira fila de próximas ações. Cor comunica estado da vaga
sem leitura; vagas abertas "acesas", encerradas "apagadas". Aprovado pelo dono: paleta limão sobre
ameixa, entrega única.

Restrições que continuam valendo: somente leitura, sem banco, enums intocados, rótulos e agrupamentos
só em `present.ts` (apresentação, nunca regra do job-search), auth e rotas atuais preservadas.

## Decisões

- Meta semanal de candidaturas: preferência do navegador (`localStorage`, padrão 5), editável em
  Configurações. É conveniência pessoal, não dado do job-search; sem ela o anel usa o padrão.
- Enviadas na semana: `data_candidatura` dentro da semana ISO atual (UTC), mesma semana de
  `weekStart()`.
- Estado visual da vaga (`jobState`): envio incerto > enviada > retirada > descartada/não priorizada >
  encerrada (disponibilidade ENCERRADA ou aba Encerradas) > pronta p/ revisão > aberta > não confirmada.
- Trilha: NÃO INICIADA 0, EM PREPARAÇÃO 1, PRONTA PARA REVISÃO 2, ENVIADA 3 de 3. Valor inválido ou
  vazio = sem trilha.
- Fila "Hoje": SELECIONADA + ABERTA, fora da aba Encerradas, candidatura ainda não enviada, retirada
  nem incerta; ordem por interesse, depois etapa mais avançada, depois análise mais recente.

## Itens

- [x] Tokens: paleta ameixa/limão (escuro e claro), tokens de estado, fonte display (Bricolage Grotesque)
- [x] `present.ts`: `jobState`, `journeyStep`, `flameCount`, `todayQueue`; `metrics.ts`: `sentInWeek`
- [x] Testes unitários dos helpers novos
- [x] Componentes base: `StateBadge`, `Flames`, `JourneyTrail`, `GoalRing`, `JobCard`
- [x] `/` vira "Hoje": frase-herói, anel da meta, chips de pendência, próxima jogada, fila, enviadas
- [x] `/analise` recebe KPIs, funil, evolução, distribuições, cobertura e qualidade (conteúdo antigo)
- [x] `/vagas`: cartões por padrão, alternância para tabela (preferência local)
- [x] `/vaga/[id]`: cabeçalho com faixa de estado, chamas, trilha e CTAs
- [x] Sidebar, cabeçalho de página, SectionCard, badges e Configurações (meta semanal) no novo visual
- [x] E2E ajustado às novas rotas
- [x] Gates: lint, format, tsc, vitest, build, e2e; screenshots claro/escuro/mobile

## Resultado

Entregue na branch `feat/visual-redesign`. Gates: lint (0 erros; 2 avisos antigos em
`app/layout.tsx`), prettier, `tsc --noEmit`, vitest 131/131, `next build`, Playwright 17/17 (servidor
`next start` na porta 3010 com o ambiente E2E, porque a 3000 estava ocupada por outro projeto).
Screenshots conferidos: Hoje (escuro, claro, 390px sem scroll horizontal), Vagas, detalhe, Análise,
Configurações. Um erro de hidratação React #418 apareceu uma vez na primeira captura após subir o
servidor e não se repetiu em três rodadas seguidas com log por página.
