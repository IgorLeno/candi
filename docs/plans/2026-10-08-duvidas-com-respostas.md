# Dúvidas do ChatGPT com respostas prontas (currículo parado)

Status: **implementado** (2026-10-08). Sem execução real com o ChatGPT (ver "Verificação").

Decisões do usuário (2026-10-08, todas as recomendadas):

1. Várias dúvidas: cada uma precisa de uma resposta pronta escolhida, ou o texto em "Outro" (vale para tudo); "Outro"
   também pode ir junto das respostas como complemento.
2. Regra nova no prompt: não abrir dúvida sobre elegibilidade, janela de formação ou campo de formulário (o currículo
   mantém as datas canônicas; isso é da análise e da candidatura).
3. Currículos já parados sem respostas no handoff (Hatch, Tokio, Sabesp): só "Outro".

## Pedido

No card de um GERAR_CURRICULO parado em `HUMAN_REVIEW_DOUBTS`, "Como seguir?" mostra "Refazer o patch no ChatGPT"
(inútil nesse caso: sem orientação, o ChatGPT repete a dúvida) e "Outro" (texto livre). O usuário quer que o próprio
ChatGPT, ao deixar uma dúvida, exponha o problema e proponha ~5 respostas prontas; o usuário escolhe e segue. "Outro"
continua para quando nenhuma serve.

## O que o código dá hoje (verificado)

- Prompt do currículo: `cv_pipeline.PROMPT` (Claude Design) e `cv_pipeline.LOCAL_PROMPT` (`cv_local.RULES_AND_FORMAT`,
  renderer local) terminam em `DÚVIDAS PARA INTERVENÇÃO HUMANA` com `- <dúvida>` (ou "nenhuma"). A edição revisada
  (`cv_edit`) reusa os dois formatos.
- Parsers: `cv_pipeline.parse` e `cv_patch.parse` jogam toda linha da seção em `doubts` (string). Dúvida → handoff
  BLOCKED, `## BLOCKERS` com `- dúvida do ChatGPT para intervenção humana: <texto>`.
- `dispatch.cv_recovery`: `doubts` = até 5 strings ≤ 300 lidas de `## BLOCKERS`; `options` sempre inclui `chatgpt`
  ("Refazer o patch no ChatGPT"); `note_allowed: true`. `resume-cv --option chatgpt [--note-stdin]` grava a nota em
  `orientacao.md` e o prompt novo a cita em `ORIENTAÇÃO DO USUÁRIO`.
- Painel: `CvResume` (`components/job-search/ops.tsx`) mostra dúvidas em lista e as opções + "Outro";
  `cvRecoverySchema` exige `options.min(1)`. O fake do E2E devolve `RECOVERY` fixo com `doubts: []`.
- A skill `/ajustar-curriculo` não fala de dúvidas (o handoff BLOCKED nunca chega ao Claude): **não muda**; nada a
  colar na conta claude.ai. Com o renderer local não há Claude.

## Caso Sabesp: de onde veio "entre 12/2026 e 12/2026"

- É literal do bloco estruturado "Requisitos" da Eureca (`Data de formação: entre 12/2026 e 12/2026`, mínimo = máximo).
  A página oficial da Sabesp diz graduação concluída entre 2022 e 2026. O `posting.md` (capturado 2026-10-01) já
  registra os dois; o dossier copia o requisito literal. Não foi invenção do ChatGPT nem da skill.
- As duas rodadas de currículo (02/10) são **anteriores** à regra canônica `methodology/job-analysis.md` "Janela de
  formação até 12/2026" (Igor, 06/10) e à reanálise de 06/10 (`d-20261006T213159Z-f78882`), cujo dossier agora traz o
  risco `FORMACAO_CONCLUIDA_EXIGIDA` resolvido ("tratado como atendido; manter a distinção out/2026 × mar/2027"). O
  prompt do currículo inclui esse risco (`_analysis`), então uma rodada nova já recebe a resolução.
- A dúvida misturava currículo com formulário ("qual data informar no campo de formação"). O currículo nunca muda
  datas (REGRAS); campo de formulário é da candidatura (`application-safety.md`).

## Proposta

### Contrato da resposta do ChatGPT (os dois formatos)

```
DÚVIDAS PARA INTERVENÇÃO HUMANA
DÚVIDA 1: <o problema em até 2 frases: o que a vaga pede, o que os fatos dizem, o que fica travado>
RESPOSTA 1.1: <resposta pronta para o Igor escolher, curta, usando só fatos das EVIDÊNCIAS>
RESPOSTA 1.2: ...
(de 2 a 5 RESPOSTAs por DÚVIDA; ou só "nenhuma")
```

Regras novas no prompt: cada resposta é uma decisão que destrava o patch (ex.: "Manter a candidatura com base no
perfil e registrar conclusão das atividades acadêmicas em out/2026, colação prevista em mar/2027"), nunca inventa
fato; dúvida respondida na ORIENTAÇÃO DO USUÁRIO não volta em DÚVIDAS.

Parser comum (`cv_patch`, usado também por `cv_pipeline.parse`): `DÚVIDA n:` abre uma dúvida, `RESPOSTA n.m:` anexa
a ela; `- <texto>` antigo continua virando dúvida sem respostas (resposta fora do formato novo não trava). Caps:
5 dúvidas × 5 respostas, 300/200 caracteres.

### Handoff e dispatcher

- Handoff BLOCKED ganha `## DOUBT ANSWERS` (`- 1.2: <texto>`), `## BLOCKERS` inalterado.
- `cv_recovery`: em `HUMAN_REVIEW_DOUBTS`, `doubts` vira `[{text, answers: [..]}]`; `options` fica **vazio** (some
  "Refazer o patch no ChatGPT"); outros motivos (Claude parou, overflow, formato inválido...) mantêm as opções de hoje.
- `resume-cv <id> --option chatgpt --answers 1=2,2=1 [--note-stdin]`: argv só com índices (regex fixa), o texto da
  resposta é relido do handoff pelo job-search (o painel nunca manda texto do ChatGPT de volta). Cada dúvida precisa de
  uma resposta escolhida **ou** a nota "Outro". A nota gravada em `orientacao.md` cita "Dúvida n: … / Resposta
  escolhida: …" + o "Outro" se houver.
- Handoffs antigos (Sabesp, Hatch, Tokio) não têm respostas: só "Outro" aparece.

### Painel

- `cvRecoverySchema`: `doubts` = objetos, `options.min(0)`; `resumeCv` aceita `{answers, note?}`.
- `CvResume`: para cada dúvida, o problema + radios das respostas + "Outro" (textarea única, 1500); "Tentar de novo"
  habilitado quando toda dúvida tem resposta ou há texto em "Outro". Texto puro, nunca HTML.
- Fake do E2E espelha o contrato (fake-1002 para nas dúvidas); `present.ts` ganha os textos de `ANSWERS_*` (o motivo
  continua vindo do job-search).

## Itens

- [x] js: testes primeiro (parser dos dois formatos, handoff, `cv_recovery`, `resume-cv --answers`)
- [x] js: prompt + parser + handoff (`cv_patch`, `cv_pipeline`, `cv_local`)
- [x] js: `dispatch.py` (`cv_recovery`, `resume_cv`, CLI) + RUNTIME.md/resume-handoff.md
- [x] painel: schema, action, `CvResume`, present.test.ts, fake + E2E
- [x] gates dos dois repos; E2E em cópia isolada (porta ≠ 3000)
- [x] memória + resumo do que foi e não foi verificado

## Verificação (2026-10-08)

- job-search: `scripts` 638 e `hermes/browsers` (test_dispatch, test_cv_edit, test_cv_pipeline) 175, verdes; leitura
  real (só leitura) de `cv_recovery` nos parados Sabesp e Hatch: dúvidas sem respostas, `options` vazio, só "Outro".
- Painel: lint (só os 2 avisos antigos de `app/layout.tsx`), `tsc --noEmit`, Vitest 244, Prettier; E2E 40/40 numa
  cópia isolada na porta 3005 (inclui o teste novo de fake-1002).
- Não verificado: o ChatGPT real seguindo o formato `DÚVIDA n`/`RESPOSTA n.m` e a regra de elegibilidade (pede rodar
  um GERAR_CURRICULO real, com OK do usuário).

## Fora do escopo

- Card de "Pedir edição" revisada (`edit_doubts`): o parser novo mantém o texto das dúvidas; respostas lá ficam para
  depois, se o usuário quiser.
- Responder/retomar os currículos parados (Hatch, Tokio, Sabesp): é com o usuário.
