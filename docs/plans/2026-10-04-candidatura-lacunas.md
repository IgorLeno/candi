# Lacunas da candidatura (2026-10-04)

Pedido do usuário: com o programa pronto para teste, todo contratempo da candidatura precisa aparecer no painel e
ser corrigível de lá. Fase 1 (investigação) feita sem mudar código; Fase 2 só com OK, item por item. Mapa completo,
com arquivo:linha do job-search: `job-search/.agents/plan-application-gaps-20261004.md`.

## O que o painel mostra hoje

"Preencher vaga" (`JobApplicationOps`, components/job-search/ops.tsx:1899) → `startDispatch` (app/actions/ops.ts:53)
→ card com etapas preflight → currículo → página aberta → "Cole o prompt" e a caixa de copiar (ops.tsx:1197, :1219).
Recusas viram toast por `refusalText` (lib/ops/present.ts:207; desconhecido = "Disparo recusado (CÓDIGO).").
Depois de colar, o painel não acompanha mais nada: não há "Enviei", "vaga encerrada" nem leitura do Claude.

| #    | Problema                                                                                      | Painel hoje                                                       | Corrigível hoje?                                 | Proposta                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | Envio feito não vira `ENVIADA` (o caminho do host não faz claim; `record-human-submit` exige) | nada                                                              | não                                              | botão "Registrar envio" → `dispatch.py record-sent <job_id> --evidence <enum>`                                                     |
| P0-2 | `state.json` do backlog quebra o Application Operator (`STATE_CORRUPT`, 37 de 40 vagas)       | "Disparo recusado (STATE_CORRUPT)." em Descartar/Excluir          | não                                              | correção no job-search (arquivo próprio do operador); painel ganha texto do código                                                 |
| P1-3 | Prompt aponta para o PDF antigo depois de "Pedir edição"/novo currículo                       | prompt antigo com botão de copiar                                 | sim, se o usuário perceber (Preencher de novo)   | aviso no card quando `progress.prompt_stale`                                                                                       |
| P1-4 | Vaga encerrada vista durante a candidatura                                                    | nada (o Claude avisa na aba)                                      | não (só Descartar = USER_DECLINED)               | "Vaga encerrada" → `dispatch.py mark-closed <job_id>` (espelho do confirm-open)                                                    |
| P1-5 | Application Browser (CDP 9227) fechado                                                        | toast "Abra-o e tente de novo"                                    | não                                              | `open-browser application`; botão no diálogo e ação no toast (diálogo fecha antes)                                                 |
| P1-6 | Outra candidatura (de outra vaga, até INCERTO não dispensado) bloqueia                        | toast "Outra candidatura está em andamento"                       | só achando a vaga à mão                          | detalhe com o job_id → link para a vaga; botão do INCERTO do host diz "Conferi, liberar" (hoje "Conferi no Desktop", ops.tsx:1234) |
| P1-7 | Currículo dentro da candidatura para em `OUTPUT_EXISTS` (ou outro código do CV)               | "ação sua necessária (veja o código)"                             | não para `OUTPUT_EXISTS` (pede renomear arquivo) | job-search usa nome `-vN`; card aponta para a seção Currículo com o motivo                                                         |
| P2-8 | ENVIO INCERTO (Grok/legado)                                                                   | alerta sem botão (app/(dashboard)/vaga/[job_id]/page.tsx:183-187) | não                                              | `dispatch.py reconcile <job_id> --evidence <enum>` (só enums)                                                                      |
| P2-9 | O que o Claude respondeu (READY_TO_SUBMIT, pergunta, login)                                   | nada                                                              | não                                              | leitura só leitura do fim da resposta no Chrome application (maior; decidir)                                                       |

Por desenho, sem mudança: login/CAPTCHA/MFA no site e no Claude ficam manuais (no máximo abrir o navegador, P1-5);
perguntas sem resposta no knowledge são respondidas pelo usuário na própria aba do Claude.

## Decisões pedidas ao usuário

1. P0-1: registro sem texto livre (evidência por enum, url do dossier, declaração fixa) — recomendado — ou com nota
   livre por stdin (seria a 4ª exceção). `ENVIADA` não tem volta: diálogo com confirmação.
2. P0-2: arquivo separado para o operador (recomendado) ou sobrescrever o backlog.
3. P1-4: só disponibilidade `ENCERRADA` (recomendado) ou fechar a candidatura (`RETIRADA`).
4. P1-7: nome `-vN` automático ou só texto melhor. P2-8 e P2-9: agora ou depois.

Respostas (2026-10-04): 1 = enum sem texto livre; 2 = arquivo separado; 3 = só `ENCERRADA`; 4 = `-vN` automático,
P2-8 e P2-9 adiados.

## Checklist (Fase 2)

- [ ] P0-2 texto de `STATE_CORRUPT` só se o código ainda puder aparecer depois da correção no job-search
- [ ] P0-1 `recordSent(jobId, evidence)` em app/actions/ops.ts (`requireSession()` primeiro, enum no schema, argv
      fixo), schema do resultado, textos de recusa, diálogo "Registrar envio" na seção Candidatura, fake do e2e
- [ ] P1-3 `prompt_stale` no schema do progresso e aviso no card
- [ ] P1-4 `markJobClosed(jobId)`, gating de UX, diálogo, textos, fake
- [ ] P1-5 `openApplicationBrowser()` (ou `openBrowser(name)` com enum), botão no diálogo, ação no toast conferida
      no navegador com o modal fechado (lição 2026-10-04)
- [ ] P1-6 detalhe da recusa com link; rótulo do botão do INCERTO do host
- [ ] P1-7 texto por código no card da candidatura
- [ ] gates: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` (2 warnings conhecidos), `pnpm format:check`;
      conferência visual em cópia na 3108 (fixture + fake), nunca a 3000
