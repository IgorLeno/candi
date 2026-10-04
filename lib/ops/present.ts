import type { Tone } from "@/lib/job-search/present"
import type { JobListItem } from "@/lib/job-search/present"
import { INTAKE_COMPLEMENT, INTAKE_MAX, intakeLength } from "@/lib/ops/intake"
import type {
  Dispatch,
  DispatchAction,
  DispatchProgress,
  DispatchStatus,
  LeftOutJob,
  PersistResult,
  RecordPlatform,
} from "@/lib/ops/schema"

// Labels and UX gating for bot dispatches. The dispatcher and the bots are the authority; nothing here
// recomputes a job-search rule: a disabled button only saves a refused round trip.

export const ACTION_META: Record<DispatchAction, { label: string; verb: string; description: string }> = {
  BUSCAR_VAGAS: {
    label: "Cotação de vagas",
    verb: "Cotar vagas",
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
    label: "Vaga específica",
    verb: "Buscar vaga específica",
    description:
      "O Lince procura exatamente a vaga que você descrever e faz a análise preliminar (prefilter), sem ChatGPT. Depois você decide se ela vai para a análise no ChatGPT.",
  },
  ANALISAR_INDICADA: {
    label: "Análise da vaga específica",
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
  ANALISAR_DESCOBERTA: {
    label: "Análise de vaga que ficou de fora",
    verb: "Mandar ao ChatGPT",
    description:
      "O job-search pega o texto completo desta vaga, que a cotação deixou de fora, e leva ao ChatGPT para a análise completa. O veredito do pré-filtro não impede: o writeset fica pronto e você decide se registra na planilha.",
  },
  EDITAR_CURRICULO: {
    label: "Edição do currículo",
    verb: "Pedir edição",
    description:
      "Seu pedido vai direto ao Claude in Chrome (/ajustar-curriculo), sem ChatGPT: ele edita só o que você pediu no currículo desta vaga, sem inventar fato, e exporta um PDF novo (-v2, -v3...) sem apagar o anterior.",
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
  GATEWAY_NOT_RUNNING: "O gateway Hermes está parado ou sem inferência. Inicie-o ou use o Grok.",
  DISPATCH_ACTIVE: "Já existe um disparo igual em andamento.",
  APPLICATION_DISPATCH_ACTIVE: "Outra candidatura está em andamento: uma por vez.",
  APPLICATION_CDP_DOWN: "O Application Browser (Chrome com o Claude, CDP 9227) está fechado. Abra-o e tente de novo.",
  CLOUDDESIGN_CDP_DOWN:
    "O Chrome do Cloud Design (CDP 9226) está fechado: abra o navegador do currículo e faça login no Claude.",
  CLAUDE_PANEL_CLOSED: "Abra o painel do Claude nas abas de currículo PT e EN do Cloud Design e tente de novo.",
  APPLICATION_STATE_BLOCKS: "O estado da candidatura no runtime do Grok impede um novo disparo: use o Hermes.",
  APPLICATION_LOCK_HELD: "Outra candidatura segura o lock do Application Operator.",
  DOSSIER_NOT_VALID: 'A vaga ainda não foi analisada no job-search: use "Analisar" antes.',
  JOB_NOT_ACTIONABLE: "Pelo Grok, a vaga precisa estar SELECIONADA e ABERTA: use o Hermes.",
  DISPATCH_STILL_RUNNING: "O disparo ainda está rodando.",
  DISPATCH_NOT_FOUND: "Disparo não encontrado no job-search.",
  DISPATCH_ID_INVALID: "Identificador de disparo inválido.",
  NOT_A_SEARCH: "Só o writeset de uma cotação pode ser registrado.",
  SEARCH_STILL_RUNNING: "A cotação ainda está rodando: espere o writeset ficar pronto.",
  WRITESET_NOT_VALID: "O writeset não existe ou não passou no writeset.py check.",
  PERSIST_ACTIVE: "Já há uma gravação de writeset em andamento.",
  WRITESET_ALREADY_REGISTERED: "Este writeset já foi gravado na planilha.",
  PROFILE_BUSY: "O Lince já está com um disparo em andamento (cotação ou vaga específica).",
  PLATFORM_NOT_SUPPORTED: "A vaga específica só roda pelo Hermes.",
  INTAKE_INVALID:
    "A descrição da vaga precisa ter de 10 a 1500 caracteres e não pode conter marca do painel nem marcador de contrato dos bots.",
  INTAKE_LOOKS_LIKE_APPROVAL:
    "A descrição da vaga não pode parecer uma aprovação (ok ou não seguido de 8 caracteres hex).",
  INTAKE_NOT_DONE: "A localização da vaga ainda não concluiu.",
  INTAKE_NOT_FOUND: "O Lince não localizou a vaga: descreva de novo com mais detalhe.",
  NOT_AN_INTAKE: "Este disparo não é de uma vaga específica.",
  DISCARDED: "A vaga específica foi descartada.",
  DELETED: "A vaga específica foi excluída do painel.",
  ALREADY_REGISTERED: "A vaga já foi gravada na planilha: não dá mais para descartar pelo painel.",
  SOURCE_REQUIRED: "Falta a vaga específica de origem.",
  INTAKE_TOO_LONG: "A descrição com o complemento passa de 1500 caracteres: encurte o complemento.",
  INTAKE_NOT_REFINABLE: "Só uma vaga específica que o Lince não conseguiu localizar pode ser complementada.",
  INTAKE_ALREADY_REFINED: "Esta vaga específica já foi complementada: acompanhe o card novo.",
  CANDIDATE_INVALID: "Essa candidata não está mais na lista do Lince.",
  // "Tentar de novo" num currículo travado (dispatch.py resume-cv).
  NOT_RESUMABLE: "Este currículo não está parado esperando você: atualize o painel.",
  ALREADY_RESUMED: "Este currículo já foi retomado: acompanhe o card novo.",
  OPTION_INVALID: "Essa opção não vale mais para este bloqueio: atualize o painel.",
  NOTE_NOT_EXPECTED: "O texto em \u201cOutro\u201d só vai junto com um patch novo no ChatGPT.",
  HANDOFF_NOT_REUSABLE: "O patch anterior não pode ser reaproveitado: refaça o patch no ChatGPT.",
  // "Abrir navegador do currículo" (dispatch.py open-browser clouddesign).
  BROWSER_INVALID: "Navegador fora da lista do job-search.",
  NO_GRAPHICAL_SESSION:
    "O job-search não achou a sessão gráfica (DISPLAY/Wayland): abra pelo atalho Cloud Design Browser.",
  CLOUDDESIGN_OPEN_NO_CDP:
    "O Chrome do Cloud Design está aberto sem CDP: feche essa janela e clique em Abrir navegador do currículo de novo.",
  CLOUDDESIGN_OPEN_FAILED:
    "O job-search não conseguiu abrir o Chrome do Cloud Design: tente o atalho Cloud Design Browser (log em native-clouddesign.log).",
  // "Analisar" (dispatch.py start ANALISAR_VAGA).
  CHATGPT_BUSY: "O ChatGPT do job-search já está ocupado com outra cotação, currículo ou análise: espere terminar.",
  // "Pedir edição" do currículo (dispatch.py start EDITAR_CURRICULO).
  REQUEST_INVALID: "O pedido precisa ter de 10 a 1500 caracteres, sem marca do painel nem marcador dos bots.",
  REQUEST_LOOKS_LIKE_APPROVAL: "O pedido não pode parecer uma aprovação (ok/não + código).",
  CV_NOT_READY: "Ainda não há currículo válido desta vaga: gere o currículo antes de pedir edição.",
  CV_DOC_AT_OTHER_JOB:
    "O currículo de trabalho no Claude Design está com o currículo de outra vaga. Gere de novo o desta vaga e depois peça a edição.",
  CV_DOC_BUSY: "Outro currículo está sendo gerado ou editado no Claude Design: espere terminar.",
  // "Mandar ao ChatGPT" uma vaga que a cotação deixou de fora (dispatch.py start ANALISAR_DESCOBERTA).
  SOURCE_NOT_A_SEARCH: "Esse disparo não é uma cotação de vagas.",
  NOT_LEFT_OUT: "A vaga não está entre as que esta cotação deixou de fora: atualize o painel.",
  LEFT_OUT_WITHOUT_CARD:
    "Cotação antiga: o job-search não guardou os dados desta vaga. Ela volta numa próxima cotação.",
  ALREADY_IN_RUNTIME: "Esta vaga já está no job-search (analisada por outro caminho): procure-a na lista de vagas.",
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

/** Short label of why the search left a job out (`LeftOutJob.kind`). */
export function leftOutKindLabel(kind: string): string {
  if (kind === "PREFILTRO") return "Pré-filtro"
  if (kind === "LIMITE") return "Acima do limite da rodada"
  if (kind === "ENCERRADA") return "Encerrada"
  if (kind.startsWith("BLOCKED_")) return "Página não lida"
  return kind || "Fora da rodada"
}

/** Technical reasons only (never the verdict): already running, already analysed, or no card saved. */
export function leftOutBlocker(job: LeftOutJob, analysis: Dispatch | null): string | null {
  if (analysis?.active) return "Análise desta vaga em andamento."
  if (job.in_runtime) return "Já está no job-search (analisada por outro caminho)."
  if (!job.has_card) return "Cotação antiga: sem os dados desta vaga."
  return null
}

export function refusalText(code: string): string {
  return REFUSAL_TEXT[code] ?? `Disparo recusado (${code}).`
}

// "Currículo" preview (dispatch.py cv-file): why there is no PDF to show. `detail` is cv_export's first error.
export function cvFileText(code: string, detail?: string): string {
  if (code === "CV_NOT_VALID") {
    if (detail === "CV_JSON_MISSING") return "Ainda não há currículo gerado para esta vaga."
    if (detail === "PDF_HASH_MISMATCH" || detail === "PDF_MISSING" || detail === "NOT_A_PDF")
      return "O PDF registrado para esta vaga não está mais na pasta de currículos ou foi alterado depois de gerado. Gere de novo para ver aqui."
    return "O currículo registrado não confere com o handoff atual desta vaga (geração nova não concluída?). Gere de novo para ver aqui."
  }
  if (code === "CV_OUTSIDE_PDF_DIR" || code === "CV_PATH_INVALID")
    return "O PDF registrado está fora da pasta de currículos; o painel não o mostra."
  return refusalText(code)
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
 * "Confirmei que está aberta" (UX gating only; job-search re-checks the Sheet and the dossier): a NÃO CONFIRMADA or
 * ENCERRADA job (the automatic read can be wrong) in the main tab whose application was not sent, uncertain or
 * withdrawn.
 */
export function canConfirmOpen(
  item: Pick<JobListItem, "statusDisponibilidade" | "statusCandidatura" | "archived" | "uncertainSubmit">
): boolean {
  if (item.archived || item.uncertainSubmit || item.statusCandidatura.invalid) return false
  const disponibilidade = item.statusDisponibilidade.invalid ? null : item.statusDisponibilidade.value
  if (disponibilidade !== "NÃO CONFIRMADA" && disponibilidade !== "ENCERRADA") return false
  const candidatura = item.statusCandidatura.value
  return candidatura !== "ENVIADA" && candidatura !== "ENVIO INCERTO" && candidatura !== "RETIRADA"
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

/** The search button: "Cotar vagas" before the first search, "Nova cotação" once there is one. */
export function searchVerb(last: Pick<Dispatch, "id"> | null): string {
  return last ? "Nova cotação" : ACTION_META.BUSCAR_VAGAS.verb
}

/**
 * "Cotar vagas" keeps its cards behind a toggle; one that needs the user stays on screen without it: running,
 * waiting for a human or holding a writeset not yet registered. Pass the search progress `withRegistration()`, so a
 * writeset already in the Sheet snapshot no longer counts. A discarded card never needs the user.
 */
export function needsUser(dispatch: Dispatch | null, progress?: DispatchProgress): boolean {
  if (!dispatch || dispatch.discarded) return false
  return dispatch.active || dispatch.status === "PRECISA_HUMANO" || canRegisterWriteset(progress ?? dispatch.progress)
}

/** Latest dispatch of an action (the dispatcher lists newest first). */
export function latest(dispatches: Dispatch[], action: DispatchAction): Dispatch | null {
  return dispatches.find((dispatch) => dispatch.action === action) ?? null
}

/**
 * The "vaga específica" card under the buttons: the newest intake still in play. Discarded ones go to their own list
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
/** The guards of the "Outro" note are the intake guards; only the wording changes. */
const RESUME_CV_REFUSAL_TEXT: Record<string, string> = {
  INTAKE_INVALID:
    "O texto precisa ter de 10 a 1500 caracteres e não pode conter marca do painel nem marcador de contrato dos bots.",
  INTAKE_LOOKS_LIKE_APPROVAL: "O texto não pode parecer uma aprovação (ok ou não seguido de 8 caracteres hex).",
}

export function resumeCvRefusalText(code: string): string {
  return RESUME_CV_REFUSAL_TEXT[code] ?? refusalText(code)
}

/** "Tentar de novo" (UX gating): a host résumé run stuck on the user, not resumed yet, with job-search's options. */
export function canResumeCv(dispatch: Dispatch): boolean {
  return (
    dispatch.action === "GERAR_CURRICULO" &&
    dispatch.mode === "host" &&
    dispatch.status === "PRECISA_HUMANO" &&
    !dispatch.retried_by &&
    !!dispatch.progress.recovery
  )
}

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
