import type { Tone } from "@/lib/job-search/present"
import type { JobListItem } from "@/lib/job-search/present"
import type { Dispatch, DispatchAction, DispatchProgress, DispatchStatus, Platform } from "@/lib/ops/schema"

// Labels and UX gating for bot dispatches. The dispatcher and the bots are the authority; nothing here
// recomputes a job-search rule: a disabled button only saves a refused round trip.

export const ACTION_META: Record<DispatchAction, { label: string; verb: string; description: string }> = {
  BUSCAR_VAGAS: {
    label: "Buscar vagas",
    verb: "Nova busca",
    description:
      "O Lince faz a busca ampla e remove as vagas com bloqueio grave; o Threadgist leva as restantes ao ChatGPT para a análise; o writeset fica pronto para o coordenador gravar na planilha.",
  },
  GERAR_CURRICULO: {
    label: "Gerar currículo",
    verb: "Gerar currículo",
    description:
      "O CVerino monta o patch com o ChatGPT e entrega ao Curriculinho, que duplica o MASTER no Claude Design, edita só a cópia e exporta cv.pdf.",
  },
  PREENCHER_CANDIDATURA: {
    label: "Preencher candidatura",
    verb: "Preencher candidatura",
    description:
      "O Candidatinho abre o navegador de candidatura e preenche o formulário até a revisão. Nada é enviado: ele para antes do botão final e pede sua aprovação no Bot Chat.",
  },
}

export const PLATFORM_LABEL: Record<Platform, string> = { hermes: "Hermes", grok: "Grok" }

export const STATUS_META: Record<DispatchStatus, { label: string; tone: Tone }> = {
  PENDENTE: { label: "Na fila", tone: "info" },
  RODANDO: { label: "Rodando", tone: "warning" },
  CONCLUIDO: { label: "Concluído", tone: "good" },
  PRECISA_HUMANO: { label: "Precisa de você", tone: "critical" },
  PARADO: { label: "Parado", tone: "muted" },
  FALHOU: { label: "Falhou", tone: "critical" },
  INCERTO: { label: "Incerto", tone: "critical" },
  MANUAL: { label: "Manual (Grok)", tone: "info" },
}

/** Refusal codes from the dispatcher or the server action, in plain Portuguese. */
const REFUSAL_TEXT: Record<string, string> = {
  UNAUTHENTICATED: "Sessão expirada. Entre de novo.",
  DISPATCH_DISABLED: "Disparo de bots desligado neste servidor.",
  DISPATCHER_UNAVAILABLE: "Não foi possível falar com o dispatcher do job-search.",
  INPUT_INVALID: "Pedido inválido.",
  JOB_NOT_FOUND: "Vaga não encontrada na planilha.",
  JOB_BLOCKED: "Esta vaga não aceita disparo no estado atual.",
  GATEWAY_NOT_RUNNING: "O gateway Hermes está parado ou sem inferência. Inicie-o ou use o Grok.",
  DISPATCH_ACTIVE: "Já existe um disparo igual em andamento.",
  APPLICATION_DISPATCH_ACTIVE: "Outra candidatura está em andamento: o Candidatinho faz uma por vez.",
  APPLICATION_STATE_BLOCKS: "O estado da candidatura no runtime impede um novo disparo.",
  APPLICATION_LOCK_HELD: "Outra candidatura segura o lock do Application Operator.",
  DOSSIER_NOT_VALID: "A vaga não tem dossier válido no runtime do job-search.",
  JOB_NOT_ACTIONABLE: "O dossier da vaga não está SELECIONADA e ABERTA.",
  DISPATCH_STILL_RUNNING: "O disparo ainda está rodando.",
}

export function refusalText(code: string): string {
  return REFUSAL_TEXT[code] ?? `Disparo recusado (${code}).`
}

/** Why a per-job button is disabled, from the Sheet row (null = allowed). */
export function jobDispatchBlocker(
  item: Pick<
    JobListItem,
    "statusAnalise" | "statusDisponibilidade" | "statusCandidatura" | "archived" | "uncertainSubmit"
  >
): string | null {
  const candidatura = item.statusCandidatura.invalid ? null : item.statusCandidatura.value
  if (item.uncertainSubmit || candidatura === "ENVIO INCERTO")
    return "ENVIO INCERTO: reconcilie a candidatura antes de qualquer ação."
  if (candidatura === "ENVIADA") return "Candidatura já enviada."
  if (candidatura === "RETIRADA") return "Candidatura retirada."
  if (item.archived || item.statusDisponibilidade.invalid || item.statusDisponibilidade.value !== "ABERTA")
    return "A vaga não está aberta."
  if (item.statusAnalise.invalid || item.statusAnalise.value !== "SELECIONADA") return "A vaga não foi selecionada."
  return null
}

/**
 * The last search stage ("registro na planilha") is the coordinator's: the dispatcher cannot see it.
 * The panel closes it from its own read-only Sheet snapshot: every writeset job_id is now in the Sheet.
 */
export function withRegistration(progress: DispatchProgress, knownJobIds: ReadonlySet<string>): DispatchProgress {
  const ids = progress.writeset_job_ids ?? []
  if (!progress.writeset_path || ids.length === 0) return progress
  const registered = ids.filter((id) => knownJobIds.has(id)).length
  const stages = progress.stages.map((stage) =>
    stage.key === "registro"
      ? {
          ...stage,
          state: registered === ids.length ? ("done" as const) : stage.state,
          note:
            registered === ids.length
              ? `${ids.length} de ${ids.length} na planilha`
              : `writeset pendente: ${registered} de ${ids.length} na planilha`,
        }
      : stage
  )
  const done = stages.filter((stage) => stage.state === "done").length
  return { ...progress, stages, percent: Math.min(100, 5 + Math.round((95 * done) / stages.length)) }
}

/** Latest dispatch of an action (the dispatcher lists newest first). */
export function latest(dispatches: Dispatch[], action: DispatchAction): Dispatch | null {
  return dispatches.find((dispatch) => dispatch.action === action) ?? null
}
