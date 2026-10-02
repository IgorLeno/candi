import type { Tone } from "@/lib/job-search/present"
import type { JobListItem } from "@/lib/job-search/present"
import { INTAKE_COMPLEMENT, INTAKE_MAX, intakeLength } from "@/lib/ops/intake"
import type {
  Dispatch,
  DispatchAction,
  DispatchProgress,
  DispatchStatus,
  PersistResult,
  RecordPlatform,
} from "@/lib/ops/schema"

// Labels and UX gating for bot dispatches. The dispatcher and the bots are the authority; nothing here
// recomputes a job-search rule: a disabled button only saves a refused round trip.

export const ACTION_META: Record<DispatchAction, { label: string; verb: string; description: string }> = {
  BUSCAR_VAGAS: {
    label: "Buscar vagas",
    verb: "Nova busca",
    description:
      "O job-search busca no LinkedIn e na Gupy pelo navegador do portal, remove só o que é objetivamente inelegível e leva o resto (e as vagas pendentes) ao ChatGPT para a análise; o writeset fica pronto para ser gravado na planilha.",
  },
  GERAR_CURRICULO: {
    label: "Gerar currículo",
    verb: "Gerar currículo",
    description:
      "O job-search pede o patch editorial ao ChatGPT, confere o formato e manda o texto sem edição ao Claude in Chrome (/ajustar-curriculo), que edita o currículo e exporta o PDF.",
  },
  PREENCHER_CANDIDATURA: {
    label: "Preencher vaga",
    verb: "Preencher vaga",
    description:
      "O job-search confere a vaga, gera o currículo se faltar, abre a página no Application Browser e prepara o prompt para você colar no Claude in Chrome. O Claude para antes do botão final; o envio é sempre seu.",
  },
  LOCALIZAR_VAGA: {
    label: "Vaga indicada",
    verb: "Indicar vaga",
    description:
      "O Lince procura exatamente a vaga que você descrever e faz a análise preliminar (prefilter), sem ChatGPT. Depois você decide se ela vai para a análise no ChatGPT.",
  },
  ANALISAR_INDICADA: {
    label: "Análise da vaga indicada",
    verb: "Mandar para o ChatGPT",
    description:
      "O job-search leva a vaga localizada direto ao ChatGPT, sem Bot; o writeset fica pronto e você decide se registra na planilha ou descarta.",
  },
  ANALISAR_VAGA: {
    label: "Análise da vaga",
    verb: "Analisar",
    description:
      "O job-search lê esta vaga na planilha (só leitura), acha o texto da publicação e leva ao ChatGPT para a análise completa. O writeset fica pronto e você decide se registra na planilha.",
  },
  REGISTRAR_WRITESET: {
    label: "Registrar na planilha",
    verb: "Registrar na planilha",
    description:
      "O job-search grava o writeset da busca na planilha com a credencial de escrita dele (writeset.py persist, só depois de writeset.py check VALID). O painel não tem credencial de escrita e não escreve na planilha.",
  },
}

export const PLATFORM_LABEL: Record<RecordPlatform, string> = { hermes: "Hermes", grok: "Grok", host: "job-search" }

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

/**
 * The card badge. A dispatch record is never rewritten after it ends, so a search that failed (e.g. on the
 * ChatGPT composer) keeps FALHOU even when its analysis was redone outside the dispatch and the resulting
 * writeset was registered later. Only a concluded registration of the current writeset counts as recovery;
 * the Sheet snapshot alone does not, since someone else may have written those jobs.
 */
export function statusBadge(
  status: DispatchStatus,
  progress: Pick<DispatchProgress, "registration">
): { label: string; tone: Tone; recovered: boolean } {
  if (status === "FALHOU" && progress.registration?.status === "CONCLUIDO") {
    return { label: "Recuperada", tone: "warning", recovered: true }
  }
  return { ...STATUS_META[status], recovered: false }
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
  APPLICATION_DISPATCH_ACTIVE: "Outra candidatura está em andamento: uma por vez.",
  APPLICATION_CDP_DOWN: "O Application Browser (Chrome com o Claude, CDP 9227) está fechado. Abra-o e tente de novo.",
  CLOUDDESIGN_CDP_DOWN: "O Chrome do Cloud Design (CDP 9226) está fechado: abra-o e faça login no Claude.",
  CLAUDE_PANEL_CLOSED: "Abra o painel do Claude nas abas de currículo PT e EN do Cloud Design e tente de novo.",
  APPLICATION_STATE_BLOCKS: "O estado da candidatura no runtime impede um novo disparo.",
  APPLICATION_LOCK_HELD: "Outra candidatura segura o lock do Application Operator.",
  DOSSIER_NOT_VALID: "A vaga não tem dossier válido no runtime do job-search.",
  JOB_NOT_ACTIONABLE: "O dossier da vaga não está SELECIONADA e ABERTA.",
  DISPATCH_STILL_RUNNING: "O disparo ainda está rodando.",
  DISPATCH_NOT_FOUND: "Disparo não encontrado no job-search.",
  DISPATCH_ID_INVALID: "Identificador de disparo inválido.",
  NOT_A_SEARCH: "Só o writeset de uma busca pode ser registrado.",
  SEARCH_STILL_RUNNING: "A busca ainda está rodando: espere o writeset ficar pronto.",
  WRITESET_NOT_VALID: "O writeset não existe ou não passou no writeset.py check.",
  PERSIST_ACTIVE: "Já há uma gravação de writeset em andamento.",
  WRITESET_ALREADY_REGISTERED: "Este writeset já foi gravado na planilha.",
  PROFILE_BUSY: "O Lince já está com um disparo em andamento (busca ou vaga indicada).",
  PLATFORM_NOT_SUPPORTED: "A vaga indicada só roda pelo Hermes.",
  INTAKE_INVALID:
    "A indicação precisa ter de 10 a 1500 caracteres e não pode conter marca do painel nem marcador de contrato dos bots.",
  INTAKE_LOOKS_LIKE_APPROVAL: "A indicação não pode parecer uma aprovação (ok ou não seguido de 8 caracteres hex).",
  INTAKE_NOT_DONE: "A localização da vaga ainda não concluiu.",
  INTAKE_NOT_FOUND: "O Lince não localizou a vaga: indique de novo com mais detalhe.",
  NOT_AN_INTAKE: "Este disparo não é de uma vaga indicada.",
  DISCARDED: "A vaga indicada foi descartada.",
  DELETED: "A vaga indicada foi excluída do painel.",
  ALREADY_REGISTERED: "A vaga já foi gravada na planilha: não dá mais para descartar pelo painel.",
  SOURCE_REQUIRED: "Falta a vaga indicada de origem.",
  INTAKE_TOO_LONG: "A indicação com o complemento passa de 1500 caracteres: encurte o complemento.",
  INTAKE_NOT_REFINABLE: "Só uma indicação que o Lince não conseguiu localizar pode ser complementada.",
  INTAKE_ALREADY_REFINED: "Esta indicação já foi complementada: acompanhe o card novo.",
  CANDIDATE_INVALID: "Essa candidata não está mais na lista do Lince.",
  // "Analisar" (dispatch.py start ANALISAR_VAGA).
  CHATGPT_BUSY: "O ChatGPT do job-search já está ocupado com outra busca, currículo ou análise: espere terminar.",
  // "Descartar vaga" (dispatch.py decline → application.py decline).
  INVALID_JOB_ID: "Identificador de vaga inválido.",
  JOB_DISPATCH_ACTIVE: "Há um disparo desta vaga em andamento: espere terminar para descartar.",
  ALREADY_SENT: "A candidatura já foi enviada: não dá para descartar.",
  SUBMIT_UNCERTAIN: "ENVIO INCERTO: reconcilie a candidatura antes de descartar.",
  ALREADY_DECLINED: "A vaga já estava retirada na planilha.",
  ROW_NOT_FOUND: "A vaga não foi encontrada na planilha.",
  ROW_DUPLICATED: "A vaga aparece duplicada na planilha: corrija antes de descartar.",
  WRONG_STATE: "A candidatura está num estado que não permite descartar.",
  REGISTRY_UNAVAILABLE: "O job-search não conseguiu acessar a planilha.",
  READBACK_MISMATCH: "A planilha não confirmou a gravação. Sincronize e confira a vaga.",
  DECLINE_UNCERTAIN: "Sem resposta a tempo do job-search. Sincronize e confira se a vaga ficou descartada.",
  DECLINE_FAILED: "O job-search não conseguiu descartar a vaga.",
}

export function refusalText(code: string): string {
  return REFUSAL_TEXT[code] ?? `Disparo recusado (${code}).`
}

// "Excluir vaga" (dispatch.py delete-job → application.py delete). Codes shared with "Descartar" get their own words;
// every code that may mean "some rows are already gone" sends the user to sync and check.
const DELETE_JOB_REFUSAL_TEXT: Record<string, string> = {
  JOB_DISPATCH_ACTIVE: "Há um disparo desta vaga em andamento: espere terminar para excluir.",
  ALREADY_SENT: "A candidatura já foi enviada: não dá para excluir a vaga.",
  SUBMIT_UNCERTAIN: "ENVIO INCERTO: reconcilie a candidatura antes de excluir a vaga.",
  ROW_DUPLICATED: "A vaga aparece duplicada na planilha: corrija antes de excluir.",
  WRONG_STATE: "A candidatura está num estado que não permite excluir.",
  BACKUP_FAILED: "O job-search não conseguiu gravar o backup local, então nada foi apagado.",
  ROWS_CHANGED: "A planilha mudou durante a exclusão e nada foi apagado. Sincronize e tente de novo.",
  DELETE_PARTIAL:
    "Exclusão parcial: parte das linhas saiu da planilha e a linha principal ficou. Sincronize, confira e exclua de novo para terminar.",
  DELETE_UNCERTAIN:
    "O job-search não confirmou a exclusão: pode ter apagado linhas. Sincronize e confira a vaga na planilha.",
  DISPATCHER_UNAVAILABLE:
    "Não foi possível falar com o dispatcher do job-search e a exclusão pode ter acontecido. Sincronize e confira a vaga.",
  DELETE_FAILED: "O job-search não conseguiu rodar a exclusão; nada foi apagado.",
}

export function deleteJobRefusalText(code: string): string {
  return DELETE_JOB_REFUSAL_TEXT[code] ?? refusalText(code)
}

/**
 * "Excluir vaga" (UX gating only; job-search re-checks the Sheet and the events): any job in the main tab whose
 * application was not sent or uncertain. Discarded (RETIRADA) jobs can be deleted; rows only in "Encerradas" cannot.
 */
export function canDeleteJob(item: Pick<JobListItem, "statusCandidatura" | "uncertainSubmit" | "archived">): boolean {
  if (item.uncertainSubmit || item.archived || item.statusCandidatura.invalid) return false
  const candidatura = item.statusCandidatura.value
  return candidatura !== "ENVIADA" && candidatura !== "ENVIO INCERTO"
}

/** The strong confirmation of "Excluir vaga": the user types the job_id itself. */
export function deleteJobConfirmed(typed: string, jobId: string): boolean {
  return typed.trim() === jobId
}

// "Confirmei que está aberta" (dispatch.py confirm-open). Codes shared with "Descartar" get their own words.
const CONFIRM_OPEN_REFUSAL_TEXT: Record<string, string> = {
  JOB_DISPATCH_ACTIVE: "Há um disparo desta vaga em andamento: espere terminar para confirmar.",
  ALREADY_SENT: "A candidatura já foi enviada: a disponibilidade não muda mais.",
  SUBMIT_UNCERTAIN: "ENVIO INCERTO: reconcilie a candidatura antes de confirmar a disponibilidade.",
  ALREADY_DECLINED: "A vaga foi descartada: a disponibilidade não muda mais.",
  ROW_DUPLICATED: "A vaga aparece duplicada na planilha: corrija antes de confirmar.",
  ALREADY_OPEN: "A vaga já está ABERTA na planilha e no dossier.",
  JOB_CLOSED: "A vaga está ENCERRADA: não volta a ABERTA por confirmação.",
  DOSSIER_NOT_VALID: "A vaga não tem dossier válido no runtime do job-search: rode a análise antes.",
  WRITESET_NOT_VALID: "O writeset da confirmação não passou no writeset.py check; nada foi gravado.",
  OPEN_FAILED: "O job-search não conseguiu gravar a confirmação; nada foi gravado.",
  OPEN_UNCERTAIN: "Sem resposta a tempo do job-search. Sincronize e confira a disponibilidade; repetir é seguro.",
  DOSSIER_WRITE_FAILED: "A planilha ficou ABERTA, mas o dossier local não foi gravado: confirme de novo para terminar.",
}

export function confirmOpenRefusalText(code: string): string {
  return CONFIRM_OPEN_REFUSAL_TEXT[code] ?? refusalText(code)
}

/**
 * "Confirmei que está aberta" (UX gating only; job-search re-checks the Sheet and the dossier): a NÃO CONFIRMADA job
 * in the main tab whose application was not sent, uncertain or withdrawn.
 */
export function canConfirmOpen(
  item: Pick<JobListItem, "statusDisponibilidade" | "statusCandidatura" | "archived" | "uncertainSubmit">
): boolean {
  if (item.archived || item.uncertainSubmit || item.statusCandidatura.invalid) return false
  if (item.statusDisponibilidade.invalid || item.statusDisponibilidade.value !== "NÃO CONFIRMADA") return false
  const candidatura = item.statusCandidatura.value
  return candidatura !== "ENVIADA" && candidatura !== "ENVIO INCERTO" && candidatura !== "RETIRADA"
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
  if (!item.archived && !item.statusDisponibilidade.invalid && item.statusDisponibilidade.value === "NÃO CONFIRMADA")
    return 'A disponibilidade da vaga não está confirmada: confira a página e use "Confirmei que está aberta".'
  if (item.archived || item.statusDisponibilidade.invalid || item.statusDisponibilidade.value !== "ABERTA")
    return "A vaga não está aberta."
  if (item.statusAnalise.invalid || item.statusAnalise.value !== "SELECIONADA") return "A vaga não foi selecionada."
  return null
}

/**
 * "Descartar vaga" (UX gating only; job-search re-checks the Sheet): not after a sent, uncertain or withdrawn
 * application. Closed or unselected jobs can still be discarded: the user is choosing what to keep.
 */
export function canDeclineJob(item: Pick<JobListItem, "statusCandidatura" | "uncertainSubmit">): boolean {
  if (item.uncertainSubmit || item.statusCandidatura.invalid) return false
  const candidatura = item.statusCandidatura.value
  return candidatura !== "ENVIADA" && candidatura !== "ENVIO INCERTO" && candidatura !== "RETIRADA"
}

/**
 * "Analisar" (UX gating only; job-search re-checks): any job in the Sheet, sent or not, as long as no analysis of it
 * is running. Returns why the button is disabled, or null.
 */
export function analyzeJobBlocker(latestAnalysis: Pick<Dispatch, "active"> | null): string | null {
  return latestAnalysis?.active ? "Análise desta vaga em andamento." : null
}

/**
 * The last search stage ("registro na planilha"): the dispatcher closes it when it persisted the writeset
 * itself; the coordinator may also persist it outside the panel. The panel adds its read-only Sheet snapshot:
 * once every writeset job_id is in the Sheet, the stage is done whoever wrote it.
 */
export function withRegistration(progress: DispatchProgress, knownJobIds: ReadonlySet<string>): DispatchProgress {
  const ids = progress.writeset_job_ids ?? []
  if (!progress.writeset_path || ids.length === 0) return progress
  const registered = ids.filter((id) => knownJobIds.has(id)).length
  const all = registered === ids.length
  const stages = progress.stages.map((stage) =>
    stage.key === "registro"
      ? {
          ...stage,
          state: all ? ("done" as const) : stage.state,
          note: all
            ? `${ids.length} de ${ids.length} na planilha`
            : [stage.note, `${registered} de ${ids.length} na planilha`].filter(Boolean).join(" · "),
        }
      : stage
  )
  const done = stages.filter((stage) => stage.state === "done").length
  return { ...progress, stages, percent: Math.min(100, 5 + Math.round((95 * done) / stages.length)) }
}

export function isActiveStatus(status: DispatchStatus): boolean {
  return status === "PENDENTE" || status === "RODANDO"
}

/**
 * "Registrar na planilha" is offered while a valid writeset exists, its stage is not done (by the dispatcher
 * or by the Sheet snapshot) and no persistence is running. The dispatcher re-checks everything.
 */
export function canRegisterWriteset(progress: DispatchProgress): boolean {
  if (!progress.writeset_path) return false
  const stage = progress.stages.find((item) => item.key === "registro")
  if (stage?.state === "done") return false
  return !(progress.registration && isActiveStatus(progress.registration.status))
}

export function persistSummary(result: PersistResult | null | undefined): string | null {
  if (!result) return null
  const { INSERTED, UPDATED, UNCHANGED } = result.jobs
  return `${INSERTED} novas, ${UPDATED} atualizadas, ${UNCHANGED} sem mudança`
}

/** Latest dispatch of an action (the dispatcher lists newest first). */
export function latest(dispatches: Dispatch[], action: DispatchAction): Dispatch | null {
  return dispatches.find((dispatch) => dispatch.action === action) ?? null
}

/**
 * The "vaga indicada" card under the buttons: the newest intake still in play. Discarded ones go to their own list
 * and a complemented one (`refined_by`) is carried by the newer card, so neither comes back as the latest.
 */
export function activeIntake(dispatches: Dispatch[]): Dispatch | null {
  return (
    dispatches.find(
      (dispatch) => dispatch.action === "LOCALIZAR_VAGA" && !dispatch.discarded && !dispatch.refined_by
    ) ?? null
  )
}

/** Discarded intakes, newest first ("Indicações descartadas"). Deleted ones never reach the panel. */
export function discardedIntakes(dispatches: Dispatch[]): Dispatch[] {
  return dispatches.filter((dispatch) => dispatch.action === "LOCALIZAR_VAGA" && dispatch.discarded)
}

/** The latest analysis of a "vaga indicada" (the dispatcher lists newest first). */
export function analysisOf(analyses: Dispatch[], intakeId: string): Dispatch | null {
  return analyses.find((dispatch) => dispatch.source_id === intakeId) ?? null
}

/**
 * "Mandar para o ChatGPT": the Lince located the job, it was not discarded and no analysis of it is running or
 * done (a failed one may be retried). A BLOQUEIO_GRAVE prefilter does not block: the user decides.
 */
export function canAnalyzeIntake(intake: Dispatch, analysis: Dispatch | null): boolean {
  if (intake.action !== "LOCALIZAR_VAGA" || intake.discarded || intake.status !== "CONCLUIDO") return false
  if (!intake.progress.intake?.found) return false
  return !(analysis && !analysis.discarded && (analysis.active || analysis.status === "CONCLUIDO"))
}

/**
 * "Escolher candidata / Outro": the Lince could not tell which job (NEEDS_CONTEXT), the intake was kept and no
 * complement was sent yet. Dismissing the card ("Dispensar") does not block it. The dispatcher checks it again.
 */
export function canRefineIntake(intake: Dispatch): boolean {
  if (intake.action !== "LOCALIZAR_VAGA" || intake.discarded || intake.refined_by) return false
  return intake.status === "PRECISA_HUMANO" && intake.code === "NEEDS_CONTEXT"
}

/** Characters left for the complement: the dispatcher refuses original + separator + complement over 1500. */
export function refineRoom(intakeText: string | null | undefined): number {
  if (!intakeText) return 0
  return Math.max(0, INTAKE_MAX - intakeLength(intakeText) - intakeLength(INTAKE_COMPLEMENT))
}

/**
 * "Descartar" (panel only, nothing goes to the Sheet): not while something runs and not after the writeset was
 * recorded. The dispatcher checks the whole chain again.
 */
export function canDiscard(dispatch: Dispatch): boolean {
  if (dispatch.action !== "LOCALIZAR_VAGA" && dispatch.action !== "ANALISAR_INDICADA") return false
  if (dispatch.discarded || isActiveStatus(dispatch.status)) return false
  const registration = dispatch.progress.registration
  return !(registration && (registration.status === "CONCLUIDO" || isActiveStatus(registration.status)))
}

/**
 * "Excluir" (panel only, nothing goes to the Sheet): like "Descartar", and also for an intake already discarded.
 * The dispatcher hides the whole lineage and checks it again.
 */
export function canDelete(dispatch: Dispatch): boolean {
  if (dispatch.action !== "LOCALIZAR_VAGA" && dispatch.action !== "ANALISAR_INDICADA") return false
  if (isActiveStatus(dispatch.status)) return false
  const registration = dispatch.progress.registration
  return !(registration && (registration.status === "CONCLUIDO" || isActiveStatus(registration.status)))
}
