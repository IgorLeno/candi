# Vagas em andamento (aviso global de "precisa de você")

Status: **implementado** (2026-10-07). Desenho aprovado pelo usuário com as quatro recomendações (seção abaixo).

## Problema

Os cards de disparo só aparecem na página da vaga (`/vaga/[job_id]`, `JobOpsProvider`) ou em `/cotar`. Caso real de
2026-10-07: dois GERAR_CURRICULO pararam em `PRECISA_HUMANO` / `HUMAN_REVIEW_DOUBTS` (Hatch 4463543061, Tokio Marine 4450471269) e nada no resto do painel avisava. Quem não abre a página da vaga nunca sabe.

## O que o código já dava (verificado)

- `dispatch.py list` sem `--job-id` devolve os registros mais novos de todas as vagas (`--limit`, teto 50).
- `acknowledged` já é o sinal único de "aposentado": `ack`, `retried_by` (resume-cv), `refined_by` (intake),
  `superseded_by` (proposta de edição) e `discard` gravam `acknowledged=True`. `_blocking()` já trata `INCERTO` não
  reconhecido como pendente.
- `STATUS_META` (`lib/ops/present.ts`) já tem rótulo e tom: "Precisa de você", "Incerto", "Falhou", "Manual (Grok)".
- O polling era por página (`useDispatches`, 5 s só enquanto algo roda).

### Custo medido (máquina do usuário, leitura apenas)

| chamada                          | tempo  |
| -------------------------------- | ------ |
| `list --limit 5`                 | 0,56 s |
| `list --limit 20`                | 6,3 s  |
| `list --limit 50`                | 10,9 s |
| `attention` (novo, 63 registros) | 0,9 s  |

O custo do `list` está em `progress()`: cada registro roda `writeset`/`cv` em subprocesso (~0,24 s cada; cProfile).
Um poll global com `list --limit 50` seria caro, beiraria o timeout de 30 s do `execFile` e, com limite, um card
parado antigo cairia para fora da janela.

### Estado real no dia (63 registros)

Não reconhecidos e fora de CONCLUIDO: 6 `PRECISA_HUMANO` (2 de hoje, 4 entre 29/09 e 02/10), 2 `FALHOU`
(`SHEET_HTTP_429`, 30/09), 1 `PARADO` (`PATCH_READY`, 30/09), 1 `MANUAL` (Grok, 02/10). Com "só o mais novo por
vaga+ação", o `attention` real listou 7 esperando o usuário, 1 writeset sem registro e 1 rodando.

## Decisões do usuário (2026-10-07)

1. **Lugar**: seção "Em andamento" no Sidebar + toast. No celular, chip no topo que abre a mesma lista.
2. **O que conta**: `PRECISA_HUMANO`, `INCERTO`, `MANUAL`, `FALHOU` e `PARADO` não reconhecidos, mais writeset sem
   registro, **só o disparo mais recente de cada vaga+ação** (um travado antigo sai se outro veio depois).
3. **Como some**: só quando o job-search resolve (retomado, "Dispensar" no card, registrado, nova execução). Abrir a
   vaga não apaga. Sem botão de dispensar na sidebar.
4. **Aviso**: toast no painel (sem notificação do sistema).

Opções descartadas: sino no topo (exigiria barra nova no desktop e esconde a lista atrás de um clique); card em
"Hoje" (só avisa na página inicial; pode ser somado depois lendo a mesma action).

## Desenho implementado

### job-search: `dispatch.py attention` (autoridade)

```
dispatch.py attention
→ {"ok": true, "items": [{"id", "action", "platform", "mode", "job_id", "source_id", "status", "code",
                          "created_at", "finished_at", "kind", "writeset_job_ids"?}]}
```

- Varre todos os registros não excluídos (sem janela), sem `progress()`. Agrupa por vaga+ação (cada indicação é a
  sua própria) e olha só o mais novo do grupo; descartados ficam de fora.
- `RUNNING`: `PENDENTE`/`RODANDO` (filho morto já vira `INCERTO` por `_effective`), ou writeset sendo gravado.
- `NEEDS_USER`: `PRECISA_HUMANO`/`INCERTO`/`FALHOU`/`PARADO`/`MANUAL` sem `acknowledged`.
- `WRITESET_PENDING`: ação de writeset `CONCLUIDO`, writeset VALID (`writeset.py check`, só para esses) e nenhuma
  gravação concluída do mesmo conteúdo.
- `REGISTRAR_WRITESET` não aparece sozinho: a busca ou análise de origem mostra (RUNNING enquanto grava,
  WRITESET_PENDING se a gravação falhou).
- Testes em `hermes/browsers/test_dispatch.py` (`test_attention_*`); linha na tabela de `RUNTIME.md`.

### Painel

- `lib/ops/schema.ts`: `attentionItemSchema`/`attentionResultSchema`.
- `app/actions/ops.ts`: `listAttention()` (`getAllowedSession()` primeiro, argv fixo `["attention"]`), junta empresa e
  cargo do snapshot da planilha; sem a planilha, a linha mostra o job_id.
- `lib/ops/attention.ts` (puro): `attentionEntries()` (ordem: esperando você, depois rodando; cotação cujo writeset já
  está todo na planilha sai, mesma conferência do `withRegistration` em "Cotar vagas"), rótulos (`STATUS_META`, "Falta
  registrar"), `newlyWaiting()` para o toast.
- `components/in-progress.tsx`: `useAttention()` (uma leitura por troca de página, poll de 60 s parado e 10 s com algo
  rodando, pausa com a aba oculta, sem chamadas sobrepostas); `InProgressSection` (desktop) e `InProgressChip`
  (celular, `Popover`). O layout passa `isDispatchEnabled()`: desligado, nada aparece e nada é chamado.
- `useDispatches` (`components/job-search/ops.tsx`) dispara `candi:attention-refresh` quando a lista da página muda:
  a sidebar relê na hora (ex.: depois de "Dispensar"), sem esperar o poll.
- Toast só para item que **passou a** esperar o usuário nesta aba, nunca na primeira leitura e nunca para o que a
  página atual já mostra (a página da vaga, ou `/cotar` para cotação e vaga específica).

### Acessibilidade e celular

- Cor + ícone + rótulo sempre (`TONE_CLASSES`, `AlertOctagon`/`AlertTriangle`/`Hand`/`FileSpreadsheet`/`Loader2`
  com giro só em `motion-safe`).
- `<section aria-labelledby>` "Em andamento"; contagem com texto `sr-only` ("2 precisam de você").
- Anúncio de transição: o próprio toast (o `Toaster` do sonner é `aria-live="polite"`); o poll não anuncia nada.
- Celular: chip de 44 px no topo, `Popover` (foco e `Esc` do Radix), largura `min(20rem, 100vw - 2rem)`. O toast
  cobre o topo enquanto dura; ele mesmo tem "Abrir" e fechar.

## Passos

- [x] job-search: `dispatch.py attention` + testes; gates do job-search (634 + 172 testes)
- [x] painel: schema, `listAttention()`, helper puro + testes Vitest (`__tests__/lib/ops/attention.test.ts`,
      `actions.test.ts`)
- [x] painel: seção no Sidebar, chip no celular, toast de transição, refresh pela página da vaga
- [x] fake do E2E (`attention`, só leitura) + 2 specs E2E (desktop: lista, contagem, sem toast na própria vaga, some
      após "Dispensar"; celular: chip, toast em outra página, "Abrir")
- [x] gates do painel
- [x] CLAUDE.md do painel + memória

## Fora do escopo

Responder dúvidas ou retomar disparos (Hatch, Tokio Marine: é com o usuário); notificação do sistema operacional;
qualquer escrita na planilha; dispensar pela sidebar.
