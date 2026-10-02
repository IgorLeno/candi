# Jobusque e página "Cotar vagas" (2026-10-02)

Pedido do usuário: o produto busca qualquer emprego, então "Estágios / modo caça" sai e a marca vira **Jobusque**
(escolha do usuário; "Jobusca" era a sugestão inicial). Os disparos de busca saem de "Hoje" e "Vagas" e ganham
página própria, "Cotar vagas" (`/cotar`, dentro de `app/(dashboard)/`, herda o guard de sessão). Só o painel muda:
nenhum contrato do dispatcher, nenhuma ação nova, nada no job-search. Reorganização de UI, mesma lógica
(`SearchOps`, `useDispatches`, `writeClosed`, `DiscardedIntakes`, `app/actions/ops.ts`).

Não muda: chaves de `localStorage` (`estagios:*`), nome do pacote, pastas e repo; detalhe da vaga, exceto rótulos
compartilhados.

## Decisões (check-in)

- Marca: "Jobusque" na sidebar (desktop e mobile), `<title>`/metadata e login. Subtítulo "central de vagas" (escolha do usuário).
- Hoje: hero sem "Comece pela próxima jogada."; "Próxima jogada" vira "Próxima candidatura"; sem `SearchOps`.
- Vagas: sem `SearchOps`; começa no explorador.
- Cotar vagas (sidebar: Hoje, Cotar vagas, Vagas, Análise, Configurações):
  - botão BUSCAR_VAGAS: "Cotar vagas" (sem cotação anterior) / "Nova cotação" (com uma);
  - botão LOCALIZAR_VAGA: "Buscar vaga específica";
  - rótulos dos cards: "Cotação de vagas", "Vaga específica", "Análise da vaga específica"; textos de recusa e
    toasts que dizem "vaga indicada" passam a dizer "vaga específica";
  - cards escondidos por padrão; toggles "Última cotação" e "Última vaga buscada" ao lado dos botões mostram o
    card com o mesmo conteúdo e ações (Registrar, Mandar para o ChatGPT, Descartar, recolher, fechar);
  - exceção: card que precisa do usuário aparece sozinho (ativo, PRECISA_HUMANO, writeset aguardando registro);
  - o toggle vale só na página (estado React, volta escondido ao recarregar);
  - descartadas ("Vagas específicas descartadas") ficam junto do toggle "Última vaga buscada".

## Itens

- [x] marca Jobusque (sidebar, layout, login, README título) — commit `feat(brand)`
- [x] textos de Hoje (hero, "Próxima candidatura") — commit `feat(hoje)`
- [x] página /cotar, item na sidebar, rótulos, toggles; remover SearchOps de Hoje/Vagas — commit `feat(ops)`
- [x] testes: unit de rótulos/visibilidade; e2e dashboard ("Próxima candidatura"), ops.spec em /cotar, e2e novo
      da página (botões, cards escondidos, toggle, fake dispatcher)
- [x] docs: CLAUDE.md (rotas, nomes) e este plano — commit `docs`
- [x] gates: pnpm test, tsc, lint, format:check, e2e completo na cópia 3108; screenshots Hoje, Cotar (fechado e
      aberto), Vagas
- [ ] push só com OK do usuário

## Resultado

- Commits: 3014ecb (marca), 5440472 (Hoje), c760b9e (/cotar), docs.
- Gates: pnpm test 199/199, tsc, lint (2 warnings antigos), format:check; e2e 31/31 na cópia 3108 (fixture + fake
  dispatcher), ops.spec de novo 14/14 depois do estilo do toggle ativo. Screenshots: Hoje, Vagas, Cotar fechado e
  aberto.
- Não verificado: Sheet real e bots reais (fora do escopo, nada foi disparado); a página com o disparo desligado
  só pelo código (`dispatch-off`), sem e2e.
- Ficou como era: "Na fila", "No radar", "Enviadas", "Descartadas por você"; nenhuma regra nova para o card da vaga
  localizada sem decisão (só as três condições combinadas aparecem sozinhas).
