# Hoje: ajustes da atualização, disparador automático e fontes novas (2026-10-22)

Pedido do usuário (2026-10-22, ditado). A Hoje está parada: a lista foi gravada uma vez só, em 16/10 às 08:06 (horário de Brasília)
(`today-list.json`, d-20261016T104937Z), e nenhum "Atualizar lista" rodou depois. Das 5 vagas, 2 saíram sozinhas e
sobraram 3. O usuário quer que a lista se renove sozinha, siga o que ele prefere naquele momento (ex.: Belo
Horizonte) e busque em mais portais além de LinkedIn e Gupy.

Repositórios: job-search (`/home/plasma-test/Projetos/job-search`) e painel (este). Ordem combinada: **A** janela de
ajustes → **B** disparador automático → **C** fontes novas. Cada frente fecha com testes e gates antes da próxima.

## Por quê

A Hoje é a tela número 1 e deveria trazer as vagas que valem a candidatura agora. Hoje ela depende de um clique
que ninguém lembra de dar, escolhe só pela regra fixa (SELECIONADA + ABERTA + interesse) e busca em 2 de 9 portais
com cadastro. Sucesso = abrir a Hoje e ver 5 vagas recentes, no foco escolhido, sem ter feito nada.

## Estado encontrado (só leitura, 2026-10-22)

- `run_today` (`hermes/browsers/dispatch.py`): disponibilidade → `job_discovery.search` → seleção → ChatGPT (teto 10)
  → writeset gravado → as 5 SELECIONADA + ABERTA analisadas de maior interesse (`_today_order`) em
  `$STATE/today-list.json` (`today-list/1`: `items`, `left`, `missing`, `updated_at`). Sem nenhuma preferência do
  usuário; a lista anterior é inteira reordenada.
- Painel: `TodayListControls` (`components/job-search/ops.tsx`) abre um diálogo de confirmação e chama
  `refreshTodayList()`; `todayView()` (`lib/job-search/present.ts`) monta fila + "Fora da lista" a partir da lista.
- Buscas: `methodology/discovery-searches.json` — LinkedIn (6: SP, BH, Campinas) e Gupy (3 termos).
- Portais com cadastro (`knowledge/portal-registration-status.md`): LinkedIn, Gupy, Vagas.com.br, Indeed Brasil,
  Sólides, InfoJobs, 99jobs, Across Jobs, Eureca.
- ChatGPT é a conta Plus do usuário: análise não tem custo financeiro, só tempo (fila do `chatgpt_exchange`).

## Objetivos

1. "Atualizar lista" abre uma **janela de ajustes** com: frequência automática, foco (cargo/lugar), quantas trocar,
   e adicionar vaga específica (busca na planilha → pôr na fila; não achou → busca de vaga específica).
2. Um **disparador** que, ligado, roda a atualização sozinho na frequência escolhida, mesmo com o painel fechado.
3. **Fontes novas**: varredura geral nos 7 portais além de LinkedIn e Gupy, sem prioridade entre eles.
4. "Próxima candidatura" passa a se chamar **"Candidatura atual"**.

## Fora do objetivo / anti-objetivos

- O painel continua sem credencial de escrita na planilha e sem escrever a lista: tudo passa pelo `dispatch.py`.
- Nada de login automático, CAPTCHA ou contornar bloqueio de robô. Portal que bloqueia fica fora com código.
- Nada de score novo de "interesse": a ordem continua a da metodologia (`_today_order`). O foco filtra, não pontua.
- Não muda o esquema da planilha. O foco vale só para o "Atualizar lista"; o Cotar vagas em /cotar continua sem foco.
  As fontes novas e o rodízio entre fontes (frente C) valem para os dois, porque `job_discovery.search` é o mesmo
  (decisão minha: mais alcance também no /cotar; o card "Ficaram de fora" e os e2e do /cotar mudam junto).
- Falha: a automação gravar na planilha algo que não passou pelo `writeset.py check` VALID, ou rodar duas vezes ao
  mesmo tempo, ou continuar disparando depois de desligada.

## Frente A — janela de ajustes

### O que o usuário vê

Botão "Atualizar lista" (mesmo lugar, ao lado de "Sincronizar"). O clique abre um diálogo maior (`today-settings-dialog`)
com quatro blocos e dois botões no rodapé: **"Salvar"** (só grava os ajustes) e **"Salvar e atualizar agora"**
(grava e dispara `ATUALIZAR_LISTA`). Embaixo do botão, a linha atual ganha o estado do disparador:
"Lista atualizada em 22/10 às 14:30 · há 2 h · automática a cada 6 h (próxima ~20:30)" ou "· automática desligada".

1. **Atualização automática** — chave liga/desliga + frequência: 3 h, 6 h, 12 h, 24 h (padrão 12 h, desligada).
   Detalhe na frente B.
2. **Foco** — dois campos opcionais: **Cargo** (texto, ex.: "analista de processos") e **Lugar** (texto, ex.:
   "Belo Horizonte"). Vazios = sem foco (regra atual). Preenchidos, valem para as duas fontes de vagas:
   - na cotação nova: as buscas da rodada viram cargo × lugar (ver "Buscas com foco");
   - na seleção entre as vagas já registradas: só entram vagas cujo cargo contém o termo de cargo e cuja
     localização (cidade/UF/zona do dossier ou célula de local da planilha) contém o termo de lugar, comparando sem
     acento e sem caixa.
   **Vaga remota conta como dentro de qualquer Lugar** (decisão do usuário 2026-10-22): modalidade `REMOTO` no dossier
   ou "remoto" no local passa no filtro de lugar (ainda precisa passar no de cargo). Com Lugar preenchido, a cotação
   também faz uma busca remota por cargo (LinkedIn `f_WT=2`, location "Brasil"; nas outras fontes, o termo "remoto"
   se o portal tiver filtro).
   Sem vaga suficiente no foco, a lista fica menor e a linha diz "faltaram N no foco" (não completa com vaga fora do
   foco: o usuário pediu "só nessa").
3. **Quantas trocar** — opções: **"Avaliar"** (padrão; reordena tudo e troca só quem for superado, = regra atual),
   **1**, **2**, **3**, **"Todas"**.
   - N: mantém as vagas atuais que continuam elegíveis, tira as N de menor posição e põe as N melhores que ainda não
     estão na lista. Vagas que saíram sozinhas (enviada, encerrada, reanalisada) também são repostas, sem contar no N.
   - "Todas": monta a lista preferindo vagas que não estavam nela; as antigas só completam se faltar.
   - Fixadas (abaixo) nunca são trocadas.
4. **Adicionar vaga específica** — campo de busca. Ao digitar (≥ 2 caracteres, com debounce), filtra no próprio
   cliente as vagas da planilha já carregadas na página (empresa, cargo, job_id), mostrando até 8 com estado e
   interesse e o botão **"Pôr na fila"**. Vaga já na lista mostra "Na fila"; enviada/retirada/descartada não aparece.
   - "Pôr na fila" = `pinTodayJob(jobId)` → `dispatch.py today-pin <job_id>`: job-search acrescenta a vaga à lista
     como **fixada** (fica até ser enviada, descartada ou o usuário clicar "Tirar da fila" no card). Fixada entra mesmo
     sem SELECIONADA ou sem análise do host (o usuário escolheu); conta nas 5 e fica no topo da fila, na ordem em que
     foi fixada. Com 5 fixadas, a atualização não troca nada e diz isso.
   - Nenhum resultado: o bloco mostra **"Buscar fora da planilha"**, que usa o fluxo da vaga específica que já existe
     (`startIntake(text)` → LOCALIZAR_VAGA → ANALISAR_INDICADA → "Registrar na planilha"), com o texto do campo
     pré-preenchido e as mesmas guardas (`intake.ts`). O card desse fluxo aparece na Hoje (não só em /cotar). Depois
     do registro, o card mostra "Pôr na fila" para essa vaga (decisão minha: o usuário confirma em vez de fixar
     sozinho; evita fixar uma vaga que a análise mostrou ruim).

"Próxima candidatura" → "Candidatura atual" (`app/(dashboard)/page.tsx`, id `candidatura-atual`, testes).

### Onde ficam os ajustes

Em job-search, arquivo `$STATE/today-settings.json` (0600, escrita atômica), porque o disparador (frente B) roda no
job-search sem o painel. Esquema `today-settings/1`:

```json
{"schema": "today-settings/1", "auto": {"enabled": false, "every_hours": 12},
 "focus": {"cargo": "", "lugar": ""}, "replace": "AVALIAR", "pinned": ["4459948224"], "updated_at": "…"}
```

`replace` ∈ `AVALIAR | 1 | 2 | 3 | TODAS`; `every_hours` ∈ `3 | 6 | 12 | 24`.

Comandos novos do `dispatch.py` (síncronos, sem registro de disparo, JSON como os outros):

- `today-settings` → `{"ok": true, "settings": {...}, "next_run_at": "…"|null}`.
- `today-settings set --auto on|off --every 3|6|12|24 --replace AVALIAR|1|2|3|TODAS --focus-stdin` — o foco vai
  pela **stdin** como JSON `{"cargo": "...", "lugar": "..."}`. É a **quinta exceção de texto livre**, com as mesmas
  guardas do intake adaptadas a termo curto: NFKC, sem caractere de controle, 0–80 code points por campo, sem
  `[painel:`, sem marcador de contrato, sem padrão de aprovação; recusa `FOCUS_INVALID`. O texto nunca vai ao argv e
  nunca é mandado ao ChatGPT como instrução: só filtra texto e monta buscas.
- `today-pin <job_id>` / `today-unpin <job_id>` → recusas `JOB_NOT_FOUND` (fora da planilha), `JOB_GONE` (enviada,
  retirada, descartada), `PIN_FULL` (já há 5 fixadas). Fixar/desfixar também atualiza `today-list.json` na hora
  (fixada entra no topo; desfixada volta para "Fora da lista" com motivo `DESFIXADA`), sem esperar uma atualização.

Painel: server actions `getTodaySettings`, `saveTodaySettings`, `pinTodayJob`, `unpinTodayJob` em
`app/actions/ops.ts`, todas com `getAllowedSession()` primeiro; zod em `lib/ops/schema.ts`; guardas do foco
espelhadas em `lib/ops/today-settings.ts` (só UX; job-search é a autoridade); textos de recusa em `lib/ops/present.ts`.

### Mudanças no `run_today`

- Lê `today-settings.json` no começo (ausente = padrão = comportamento atual).
- **Buscas com foco**: com cargo e/ou lugar, `job_discovery.search` recebe um `searches` gerado só para a rodada,
  em vez de `discovery-searches.json`:
  - LinkedIn: `keywords` = cargo (ou cada família do arquivo, se só houver lugar); `location` = lugar (ou cada
    `location` do arquivo, se só houver cargo).
  - Gupy e fontes novas: termo = cargo (ou os termos do arquivo); lugar filtra os cards pela localização lida.
  - O prefilter e o teto de 12 continuam os mesmos (zona FORA continua descartando; foco não libera zona proibida).
- **Seleção**: elegíveis passam pelo filtro de foco; fixadas entram primeiro e não sofrem filtro nem troca; depois
  o `replace` decide quem fica (regras do bloco 3). Motivos novos em `left`: `TROCADA` (saiu pelo N), `FORA_DO_FOCO`,
  `DESFIXADA`.
- `today-list.json` passa a `today-list/2`: `items[].pinned: bool`, `focus` usado na rodada, `missing_reason`
  (`FOCO` | `SEM_ELEGIVEIS` | null). O painel aceita `/1` e `/2` (lista antiga continua lendo).
- Análise: o teto de 10 por rodada fica (é tempo, não custo). Com foco, as SELECIONADA sem análise do host que estão
  no foco vão primeiro.

## Frente B — disparador automático

Decisão minha (playback de 2026-10-22, usuário confirmou o plano): quem dispara é o **job-search**, por um timer
do systemd do usuário, para funcionar com o painel fechado; o painel só liga, desliga e escolhe a frequência.

- `dispatch.py today-tick` (sem argumento): lê `today-settings.json`; se `auto.enabled` e já passou `every_hours`
  desde o `updated_at` da última lista **e** desde o último `ATUALIZAR_LISTA` iniciado (sucesso ou falha), e não há
  `ATUALIZAR_LISTA` ativo, inicia um, como o painel inicia (`start ATUALIZAR_LISTA --platform hermes`, registro com
  `trigger: "AUTO"`). Senão, sai sem efeito. Idempotente, com o mesmo lock dos registros.
- Unidades `job-search-today.service` (oneshot, `dispatch.py today-tick`) + `job-search-today.timer`
  (`OnCalendar=*:0/15`, `Persistent=true`) versionadas em `hermes/browsers/`, instaladas em
  `~/.config/systemd/user/` por um comando do repositório (`browsers.sh install-today-timer` ou equivalente ao que
  já instala o `job-search-hermes-gateway.service`). Instalar e habilitar é configuração persistente: **só com OK
  explícito do usuário na hora**.
- Ambiente: o tick precisa da sessão gráfica (Chrome do portal e do ChatGPT); usa o mesmo `systemctl --user
  show-environment` do `open-browser`. Sem sessão gráfica: não dispara e grava `last_skip: NO_GRAPHICAL_SESSION`
  no settings (o painel mostra "não rodou às 14:00: sessão gráfica fechada").
- Qualquer hora (decisão do usuário 2026-10-22): sem janela de silêncio e sem esperar o usuário parar de usar; o
  ChatGPT ocupado pela rodada faz "Gerar currículo"/"Analisar" esperar na fila, como hoje.
- Falha numa rodada automática (ex.: ChatGPT deslogado = PRECISA_HUMANO) aparece em "Em andamento" como as outras.
  Rodada automática que fica em PRECISA_HUMANO **pausa** o disparador até o usuário resolver ou dispensar o card
  (não empilha 4 rodadas paradas por dia).
- Painel: a chave da janela grava `auto`; a linha da Hoje mostra a próxima rodada (`next_run_at`) e o último pulo;
  o card de uma rodada automática diz "Atualização automática".

## Frente C — fontes novas

Objetivo do usuário: "varredura geral, umas duas vagas de cada", sem prioridade entre portais.

- **C0 spike (só leitura, sem login, sem Chrome)**: para cada portal (Vagas.com.br, Indeed Brasil, InfoJobs,
  Sólides, 99jobs, Across Jobs, Eureca), baixar com `curl` para o scratchpad a página pública de busca de
  "engenharia química" e parsear com `python3 -I`: dá para ler cards (título, empresa, local, URL, data) sem
  login? Bloqueia robô/CAPTCHA? Tem página da vaga pública com texto? Resultado registrado neste plano, uma linha por
  portal: `LEITURA_PUBLICA` | `SÓ_LOGADO` | `BLOQUEIA`.
- **C1..Cn**: um leitor por portal `LEITURA_PUBLICA` em `job_discovery.py` (mesmo formato de card do LinkedIn/Gupy,
  `fonte` com o nome do portal), buscas no `discovery-searches.json` (`"sources": {"vagascom": [...], ...}` →
  `discovery-searches/2`). Portal `SÓ_LOGADO` lê pelo Chrome do portal (CDP 9223, sessão do usuário) só se a página
  de resultado abrir sem desafio; senão fica fora. `BLOQUEIA` fica fora com nota no plano.
- **Equilíbrio**: depois do prefilter, a cota das 12 análises é distribuída em rodízio entre as fontes (até 2 por
  fonte por rodada, sobra volta para quem tem mais), em vez de "zona prioritária primeiro" global; zona continua
  desempatando dentro da fonte.
- Disponibilidade dessas fontes (**decisão do usuário 2026-10-22, opção a**): sem leitor de disponibilidade, a vaga
  fica `NÃO CONFIRMADA` e **entra na Hoje mesmo assim**, com o selo "aberta? confirmar" no card (ícone + texto, tom
  `uncertain`) e o botão "Confirmei que está aberta" ali mesmo. Regra de elegível do `run_today`: `SELECIONADA` e
  (`ABERTA` **ou** `NÃO CONFIRMADA` vinda de fonte sem leitor de disponibilidade); `ENCERRADA` continua fora. Na
  ordem, empate de interesse prefere `ABERTA`. O painel (`todayView`) aceita na fila o item listado com
  `items[].unconfirmed: true` mesmo fora de `todayQueue()`. Leitor de disponibilidade por portal não entra nesta frente.
- Preenchimento (Candidatinho) não muda; portal novo sem mapeamento de campos segue o fluxo atual de pendências.

## Testes e verificação

- job-search: unit tests de `today-settings` (guardas, padrão, escrita atômica), `today-pin/unpin`, seleção com foco
  e cada `replace` (stubs de `TodayDeps`), `today-tick` (devido / não devido / ativo / pausado / sem sessão),
  `main(argv)` com o argv exato do painel; leitores novos com HTML salvo do spike como fixture. Gates do plano de 16/10.
- Painel: vitest de `todayView` com `/2` e fixadas, guardas do foco, filtro da busca local; e2e (fake do dispatcher
  ganha `today-settings`, `today-pin`, `today-unpin`): abrir janela → salvar → linha mostra automática; fixar vaga →
  aparece no topo sem reload; "Buscar fora da planilha" abre o fluxo da vaga específica; "Candidatura atual".
- `pnpm exec tsc --noEmit`, eslint, prettier, vitest, e2e (porta alternativa se 3000 ocupada).
- Rodada real (só com OK do usuário): uma atualização com foco "Belo Horizonte"; instalar o timer.

## Decisões minhas (para o usuário conferir)

1. Frequências 3/6/12/24 h, padrão 12 h, desligada até ligar.
2. Foco filtra (não completa com vaga fora do foco); lista fica menor e diz quantas faltaram.
3. "Quantas trocar" padrão "Avaliar" (= regra atual).
4. Vaga fixada fica até enviar/descartar/tirar, entra sem exigir SELECIONADA, no máximo 5.
5. Vaga achada fora da planilha: depois de registrada, o usuário clica "Pôr na fila" (não fixa sozinha).
6. Disparador = timer do systemd do usuário a cada 15 min chamando `today-tick`; pausa quando uma rodada automática
   para em PRECISA_HUMANO.
7. Foco só no "Atualizar lista"; fontes novas e rodízio também no /cotar.
8. Fontes novas: spike primeiro; só entra portal que lê sem login/bloqueio (ou com a sessão do Chrome do portal sem
   desafio); rodízio de até 2 análises por fonte.

## Respostas do usuário (2026-10-22)

- Portais novos sem leitor de disponibilidade: opção (a), entram na Hoje com selo "aberta? confirmar".
- Vaga remota conta no foco de Lugar.
- Disparador a qualquer hora.

## Plano — frente A (cada item = um commit; teste vermelho antes da implementação)

Base lida em 2026-10-22: job-search main 2959f6e (working tree com 5 arquivos alheios, fora dos commits); painel
main 29c9f28. `run_today` é uma função só (dispatch.py ~2843); `job_discovery.search(searches=…)` já aceita buscas
injetadas (`{"linkedin": [(keywords, location)], "gupy": [termo]}`); `todayView` (present.ts) só conhece `/1`.

Decisão de execução (usuário confirmou 2026-10-22): **o bloco "Atualização automática" não aparece na janela na frente A**.
O `today-settings.json` já guarda `auto` (padrão desligada, 12 h), mas sem o disparador (frente B) uma chave na tela
prometeria algo que não roda. Entra na tela junto com o `today-tick`.

### job-search

- [x] J1 `feat(dispatch): keep the Hoje settings` — `$STATE/today-settings.json` (`today-settings/1`, 0600, atômico,
      ausente/fora do contrato = padrão); `normalize_focus` (NFKC, sem Cc/Cf, 0–80 por campo, sem `[painel:`,
      marcador ou aprovação → `FOCUS_INVALID`); `dispatch.py today-settings` e `today-settings set --replace … [--auto
      on|off --every N] [--focus-stdin]` (foco JSON pela stdin, nunca argv). Testes: padrão, cada guarda, arquivo
      0600, `main(argv)` com o argv exato do painel + stdin.
- [x] J2 `feat(dispatch): pin a job on the Hoje list` — `today-pin`/`today-unpin <job_id>`: lê a planilha (só
      leitura), recusa `JOB_NOT_FOUND`/`JOB_GONE`/`PIN_FULL`, grava `pinned` no settings e reescreve a lista na hora
      como `today-list/2` (fixada no topo, `pinned: true`; desfixada vai a `left` com `DESFIXADA`). `today_list()`
      devolve `/1` e `/2`. Testes com `read` falso; lock contra corrida com o `run_today`.
- [x] J3 `feat(dispatch): focus and replace in the Hoje selection` — seleção extraída para uma função pura
      (`_today_pick`): fixadas primeiro (sem filtro nem troca, saem só se enviada/retirada/descartada); filtro de foco
      (cargo contém; lugar contém em município/UF do dossier ou `local`, ou modalidade REMOTO/"remoto"; sem acento e
      sem caixa); `replace` AVALIAR/1/2/3/TODAS; motivos `TROCADA`, `FORA_DO_FOCO`; `missing_reason` FOCO |
      SEM_ELEGIVEIS; `focus` gravado na lista. Testes por modo, com e sem fixadas, lista anterior `/1`.
- [x] J4 `feat(dispatch): search with the Hoje focus` — `_focus_searches(settings, base)`: LinkedIn cargo × lugar
      (ou × locations do arquivo / famílias × lugar) + busca remota por cargo (`f_WT=2`, "Brasil"; tupla ganha o
      campo opcional `remote`); Gupy termo = cargo e lugar filtra os cards pela localização (remoto passa). Prefilter
      e teto iguais. Com foco, as SELECIONADA sem análise do host no foco vão primeiro ao ChatGPT. Testes da URL
      montada (sem rede) e da ordem.
- [x] J5 `docs(dispatch): Hoje settings, focus and pinned jobs` — docstring do dispatch.py e
      `methodology/job-analysis.md` (shortlist com foco e fixadas).

### Painel

- [x] P1 `feat(ops): read and save the Hoje settings` — `lib/ops/schema.ts` (settings, `today-list/2`, motivos
      novos), `lib/ops/today-settings.ts` (espelho das guardas, só UX), textos de recusa em `present.ts`, server
      actions `getTodaySettings`/`saveTodaySettings`/`pinTodayJob`/`unpinTodayJob` (`getAllowedSession()` primeiro;
      foco pela stdin), fake do e2e com os comandos novos. Vitest: schema, guardas, argv exato.
- [x] P2 `feat(today): pinned jobs in the queue` — `todayView` aceita `/2`: fixada fica na fila mesmo fora de
      `todayQueue()` (some só se enviada/retirada/descartada/incerta); card fixado com selo "Fixada" e "Tirar da
      fila"; linha da Hoje com foco e "faltaram N no foco". Vitest de `todayView` `/1` e `/2`.
- [x] P3 `feat(today): settings window for Atualizar lista` — `TodayListControls` abre a janela: Foco (Cargo,
      Lugar), Quantas trocar, rodapé "Salvar" e "Salvar e atualizar agora"; textos da janela inteira revisados.
      E2E: abrir → salvar → reabrir mostra o salvo; salvar e atualizar dispara.
- [x] P4 `feat(today): add a specific job from the settings window` — busca local (≥ 2 caracteres, debounce, até 8,
      empresa/cargo/job_id) sobre a lista enxuta que a página passa; "Pôr na fila"/"Na fila"; sem resultado,
      "Buscar fora da planilha" → `startIntake` com o texto; cards de LOCALIZAR_VAGA/ANALISAR_INDICADA também na
      Hoje; depois do registro, o card oferece "Pôr na fila". E2E: fixar → topo sem reload; buscar fora abre o fluxo.
- [x] P5 `feat(today): call the first job the current application` — "Próxima candidatura" → "Candidatura atual",
      id `candidatura-atual`, testes.
- [x] P6 `docs: Hoje settings window` — CLAUDE.md do painel.

### Verificação

- [ ] job-search: `python3 scripts/validate_job_search.py`; `python3 -m unittest discover -s scripts -p 'test_*.py'`;
      `python3 -m pytest -q hermes/browsers` (comparar com a base, que tem falhas antigas); `ruff check` nos tocados.
- [x] Painel: `pnpm exec tsc --noEmit`, eslint, prettier, `pnpm exec vitest run`, e2e ops.spec + dashboard.spec
      (porta alternativa se a 3000 estiver ocupada).
- [ ] Rodada real com foco "Belo Horizonte": só com OK do usuário.

### Execução — job-search (2026-10-22/23)

- Commits (main, sem push): 2beb2d5 J1, 4ec9853 J2, 88325e7 J3, 4368dbb J4, 337469e J5.
- Gates: `validate_job_search.py` OK; unittest de `scripts` 683 OK; `pytest hermes/browsers` 491 passed + as mesmas
  12 falhas antigas da base (474 passed antes; lista de falhas idêntica); `ruff check` limpo nos arquivos tocados (o
  `hashlib` sem uso em `test_dispatch.py` já existia).
- Desvios do desenho: a planilha não tem coluna de local, então o Lugar vale pelo município/UF/modalidade do dossier
  (vaga sem dossier só passa pelo filtro de cargo na ordem do ChatGPT). Fixar antes de qualquer Atualizar cria uma
  lista só com as fixadas (com o horário do momento). Card da Gupy fora do lugar é descartado em silêncio na busca com
  foco (não vai para "Ficaram de fora").
- Não verificado: rodada real (precisa do OK do usuário); nada no painel ainda (P1–P6).

### Execução — painel (2026-10-23)

- Commits (main, sem push): 029a570 P1, f6f0fc2 P2, 9551fc2 P3, 0bbdf12 P4, e6d9d4d P5, P6 (este).
- Gates: `pnpm exec tsc --noEmit` limpo; eslint e prettier limpos nos arquivos tocados (os 2 avisos de `_geist` em
  `app/layout.tsx` já existiam); `pnpm exec vitest run` 314 (base 293); e2e de ops.spec + dashboard.spec na cópia
  :3100: 40 passaram, 4 falharam. Duas são as falhas antigas da base c577b4f ("currículo local: comentários e
  edição manual…" e "carta travada com dúvida…"). As outras duas ("hoje: fila, candidatura atual e meta" e "análise →
  lista → vaga") esperaram 5 s por uma navegação na primeira compilação do `next dev` sob carga; rodadas isoladas
  (`--repeat-each 2`, com "preencher vaga: a segunda candidatura entra na fila…", que tinha falhado numa rodada
  interrompida e passou nesta) deram 6 de 6. Instáveis, não regressão da frente A.
- Desvios do desenho:
  - `today-list/2` aceita `dispatch_id: null` e `interesse: ""`: fixar antes de qualquer "Atualizar lista" grava uma
    lista sem disparo, e a fixada pode não ter interesse.
  - `REGISTRY_UNAVAILABLE` já tinha texto no painel (o do "Descartar vaga"); ficou o mesmo.
  - O "Pôr na fila" do card da vaga específica aparece quando o registro do writeset está `CONCLUIDO`, não pelo
    snapshot (que pode ainda não ter a vaga); o job-search confere na planilha.
  - Os cards da vaga específica na Hoje aparecem enquanto precisam de você e, depois de vistos, ficam até recarregar
    (para o "Pôr na fila" estar lá depois do registro). Um registrado antigo não volta para a Hoje.
  - A vaga fixada não se repete no "No radar".
  - O botão "Atualizar lista" continua desativado enquanto a lista atualiza; a janela (e o "Pôr na fila" dela) fica
    indisponível nesse tempo. Os botões "Tirar da fila" dos cards continuam.
- Achado para decidir depois: fixar antes do primeiro "Atualizar lista" cria uma lista só com as fixadas (desvio do
  job-search, acima), e a Hoje deixa de mostrar a regra da planilha até a próxima atualização. Não afeta quem já tem
  lista (a de 16/10 existe).
- Não verificado: rodada real (precisa do OK do usuário). Os e2e novos do P3 e do P4 foram escritos antes da
  implementação, mas só rodaram depois (verdes); o vermelho foi conferido no vitest (P1, P2, P4) e no e2e do P5.
