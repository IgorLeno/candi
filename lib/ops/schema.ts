import { z } from "zod"

// Contract of `job-search/hermes/browsers/dispatch.py` (JSON on stdout). The dispatcher is the authority
// on actions, preconditions and progress; this file only validates what comes back before it reaches the UI.

/** Work the panel can ask a bot to start (`dispatch.py start`). */
export const BOT_ACTIONS = ["BUSCAR_VAGAS", "GERAR_CURRICULO", "PREENCHER_CANDIDATURA"] as const
export type BotAction = (typeof BOT_ACTIONS)[number]

/**
 * "Vaga indicada" (Hermes only): LOCALIZAR_VAGA gets the user's text over stdin (`startIntake`), then
 * ANALISAR_INDICADA takes the located job to the ChatGPT (`analyzeIntake`). Not started through `startDispatch`.
 */
export const INTAKE_ACTIONS = ["LOCALIZAR_VAGA", "ANALISAR_INDICADA"] as const
export type IntakeAction = (typeof INTAKE_ACTIONS)[number]

/**
 * "Analisar" (Hermes only, job-search host pipeline): the ChatGPT analysis of one job already in the Sheet, started
 * with only its job_id (`analyzeJob`). Its writeset is registered like a search's ("Registrar na planilha").
 */
export const ANALYZE_ACTION = "ANALISAR_VAGA"

/**
 * "Mandar ao ChatGPT" (Hermes only, host pipeline, decision 2026-10-03): a job the search left out (prefilter, over
 * the 12-analyses budget, closed or unreadable) goes to the ChatGPT analysis only when the user asks
 * (`analyzeLeftOut`, `--from <search> --job-id`). Its writeset is registered like the others.
 */
export const LEFT_OUT_ACTION = "ANALISAR_DESCOBERTA"

/**
 * "Pedir edição" (decision 2026-10-03, option B): the user's own edit of a job's résumé goes straight to Claude in
 * Chrome, without ChatGPT. Third narrow free-text exception: guarded here and by job-search, sent over stdin
 * (`editCv`), stored as a private file; Hermes runs it on the host, Grok gets a fixed command for the CV Operator.
 */
export const CV_EDIT_ACTION = "EDITAR_CURRICULO"
export const CV_RENDERERS = ["claude_design", "local", "INVALID"] as const
export type CvRenderer = (typeof CV_RENDERERS)[number]

/**
 * Every record kind in the dispatcher's list. REGISTRAR_WRITESET is not a bot: it is `dispatch.py persist`,
 * where job-search runs `writeset.py persist` with its own write credential at the user's request.
 */
export const DISPATCH_ACTIONS = [
  ...BOT_ACTIONS,
  ...INTAKE_ACTIONS,
  ANALYZE_ACTION,
  LEFT_OUT_ACTION,
  CV_EDIT_ACTION,
  "REGISTRAR_WRITESET",
] as const
export type DispatchAction = (typeof DISPATCH_ACTIONS)[number]

export const PER_JOB_ACTIONS: readonly BotAction[] = ["GERAR_CURRICULO", "PREENCHER_CANDIDATURA"]

export const PLATFORMS = ["hermes", "grok"] as const
export type Platform = (typeof PLATFORMS)[number]
/** `host` = job-search itself on this machine (writeset persistence), not a bot platform. */
export const RECORD_PLATFORMS = [...PLATFORMS, "host"] as const
export type RecordPlatform = (typeof RECORD_PLATFORMS)[number]

export const DISPATCH_STATUSES = [
  "PENDENTE",
  "RODANDO",
  "CONCLUIDO",
  "PRECISA_HUMANO",
  "PARADO",
  "FALHOU",
  "INCERTO",
  "MANUAL",
] as const
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number]

/** Same pattern as job-search `agent_messages.JOB_ID_RE`. */
export const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
export const DISPATCH_ID_RE = /^d-\d{8}T\d{6}Z-[0-9a-f]{6}$/

const stageSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(["done", "active", "pending", "failed"]),
  note: z.string().optional(),
})
export type DispatchStage = z.infer<typeof stageSchema>

const countSchema = z.object({ appended: z.number(), present: z.number() })

/** Counts only: the dispatcher never records job content from `writeset.py persist`. */
const persistResultSchema = z.object({
  jobs: z.object({ INSERTED: z.number(), UPDATED: z.number(), UNCHANGED: z.number() }),
  coverage: countSchema.nullable(),
  dossiers: countSchema.nullable(),
})
export type PersistResult = z.infer<typeof persistResultSchema>

const intakeJobSchema = z.object({
  title: z.string().max(200).nullable(),
  company: z.string().max(200).nullable(),
  location: z.string().max(200).nullable(),
  url: z.string().max(2000).nullable(),
  source: z.string().max(100).nullable(),
  job_id: z.string().max(64).nullable(),
})
export type IntakeJob = z.infer<typeof intakeJobSchema>

/** `vaga-indicada.json` as the dispatcher validated it (untrusted text from the Lince: render as plain text). */
const intakeResultSchema = z.object({
  found: z.boolean(),
  reason: z.string().max(500).nullable(),
  job: intakeJobSchema.nullable(),
  /** NEEDS_CONTEXT: up to 5 plausible jobs the user may pick from (the most likely first). */
  candidates: z.array(intakeJobSchema).max(5).optional(),
  already_in_registry: z.boolean(),
  prefilter: z
    .object({ verdict: z.enum(["PASSA", "BLOQUEIO_GRAVE"]), reasons: z.array(z.string().max(300)).max(10) })
    .nullable(),
  posting: z.boolean().optional(),
})
export type IntakeResult = z.infer<typeof intakeResultSchema>

/** Diagnosis rows exactly as `writeset.py rows` has them (never recomputed by the panel). */
const diagnosisSchema = z.object({
  job_id: z.string().max(200),
  cargo: z.string().max(200),
  empresa: z.string().max(200),
  status_analise: z.string().max(200),
  interesse: z.string().max(200),
  /** Why the verdict, as the writeset has it (job-search caps it at 400 chars). Untrusted plain text. */
  motivo_analise: z.string().max(400).optional(),
})
export type Diagnosis = z.infer<typeof diagnosisSchema>

/** `dispatch.py resume-cv --option`: redo only the Claude edit (same patch) or the whole ChatGPT patch. */
export const CV_RESUME_OPTIONS = ["claude", "chatgpt"] as const
export type CvResumeOption = (typeof CV_RESUME_OPTIONS)[number]

/**
 * GERAR_CURRICULO stuck in PRECISA_HUMANO: why, in job-search's words, and how it can be resumed. Every text is
 * untrusted plain text (the Claude panel reply and the ChatGPT doubts come from the bots).
 */
const cvRecoverySchema = z.object({
  reason: z.string().max(1000),
  /** The skill's `MOTIVO:` line, when Claude stopped on purpose. */
  claude_reason: z.string().max(300).nullable(),
  /** End of the Claude panel reply, without the panel UI. */
  claude_reply: z.string().max(600).nullable(),
  /**
   * ChatGPT doubts (HUMAN_REVIEW_DOUBTS) or format errors (FORMAT_INVALID), each with the ready answers the ChatGPT
   * suggested (2026-10-08; none in older handoffs). The user picks an answer by its position only: job-search reads
   * the text back itself.
   */
  doubts: z.array(z.object({ text: z.string().max(300), answers: z.array(z.string().max(300)).max(5) })).max(5),
  /** Empty on HUMAN_REVIEW_DOUBTS: a new patch without an answer only repeats the doubt. */
  options: z
    .array(z.object({ key: z.enum(CV_RESUME_OPTIONS), label: z.string().max(100), description: z.string().max(300) }))
    .max(2),
  /** "Outro": free text that goes with a new ChatGPT patch. */
  note_allowed: z.boolean(),
})
export type CvRecovery = z.infer<typeof cvRecoverySchema>

/**
 * One job the search did not analyse (`progress.excluded_jobs`/`deferred_jobs`). Card fields are the advertiser's
 * untrusted plain text. `kind`: PREFILTRO, LIMITE, ENCERRADA or a BLOCKED_* code of the posting read. `has_card` is
 * false for older searches (no card saved: cannot be sent); `in_runtime` = already analysed some other way.
 */
const leftOutJobSchema = z.object({
  job_id: z.string().max(64),
  empresa: z.string().max(200),
  cargo: z.string().max(200),
  local: z.string().max(200),
  url: z.string().max(2000),
  fonte: z.string().max(40),
  motivo: z.string().max(300),
  kind: z.string().max(40),
  data: z.string().max(40),
  has_card: z.boolean(),
  in_runtime: z.boolean(),
})
export type LeftOutJob = z.infer<typeof leftOutJobSchema>

const cvChangeSchema = z.object({
  n: z.number().int().min(1).max(99),
  op: z.enum(["REPLACE", "INSERT_AFTER", "INSERT_BEFORE", "DUPLICATE", "REMOVE", "MOVE_AFTER"]),
  path: z.string().max(200),
  section: z.string().max(900),
  before: z.string().max(900).nullable(),
  after: z.string().max(900).nullable(),
  reason: z.string().max(900),
  evidence_source: z.string().max(900).optional(),
  mandatory: z.boolean().optional(),
  requires: z.array(z.number().int().min(1).max(99)).max(30),
})
export type CvChange = z.infer<typeof cvChangeSchema>

export const cvProposalSchema = z
  .object({
    schema: z.literal("cv-proposal/1"),
    job_id: z.string().regex(JOB_ID_RE),
    mode: z.enum(["reassess", "request"]),
    doc_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    free_px: z.number(),
    changes: z.array(cvChangeSchema).max(30),
    cuts: z.array(cvChangeSchema).max(30),
  })
  .refine((proposal) => proposal.changes.length + proposal.cuts.length <= 30)
export type CvProposal = z.infer<typeof cvProposalSchema>

const cvFitSchema = z.object({
  free_px: z.number(),
  cuts: z.array(z.number().int()).max(30),
  omitted: z.array(z.number().int()).max(30),
})

export const cvDocSchema = z.object({
  job_id: z.string().regex(JOB_ID_RE),
  lang: z.enum(["pt", "en"]),
  filename: z.string().max(200),
  doc_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sections: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().max(200),
        fields: z
          .array(
            z.object({
              path: z.string().max(200),
              item: z.string().max(900).nullable(),
              label: z.string().max(200),
              text: z.string().max(900),
              kind: z.enum(["paragraph", "bullet", "field"]),
              max: z.number().int().positive().max(900),
              locked: z.boolean(),
            })
          )
          .max(100),
      })
    )
    .max(20),
})
export type CvDoc = z.infer<typeof cvDocSchema>
export const cvDocResultSchema = z.object({ ok: z.literal(true), cv_doc: cvDocSchema })

/**
 * "Preencher vaga" (2026-10-08): what job-search still needs from the user, one item per field, and what the host did
 * itself (documents typed into the page, résumé attached). Never carries an answer, not even a common one.
 */
export const FILL_ITEM_TYPES = ["TEXTO", "ESCOLHA", "ACAO", "DOCUMENTO"] as const
export const FILL_ITEM_STATUSES = ["PENDENTE", "RESPONDIDA", "FEITA", "GUARDADA"] as const
const fillItemSchema = z.object({
  n: z.number().int().min(1).max(999),
  campo: z.string().max(200),
  tipo: z.enum(FILL_ITEM_TYPES),
  opcoes: z.array(z.string().max(200)).max(30),
  detalhe: z.string().max(600),
  status: z.enum(FILL_ITEM_STATUSES),
  documento: z.string().max(10).nullable().optional(),
})
export type FillItem = z.infer<typeof fillItemSchema>
const fillSchema = z.object({
  state: z.string().max(40).nullable(),
  rodada: z.number().int().min(0).max(99).nullable(),
  code: z.string().max(80).nullable(),
  items: z.array(fillItemSchema).max(200),
  host: z.array(z.object({ campo: z.string().max(200), resultado: z.string().max(40) })).max(50),
})
export type FillProgress = z.infer<typeof fillSchema>

const progressSchema = z.object({
  percent: z.number().min(0).max(100),
  stages: z.array(stageSchema),
  candidates: z.number().nullable().optional(),
  excluded: z.number().nullable().optional(),
  /** Search only (host, since 2026-10-03): the jobs it left out, with their card. Older records omit them. */
  excluded_jobs: z.array(leftOutJobSchema).max(200).optional(),
  deferred_jobs: z.array(leftOutJobSchema).max(200).optional(),
  writeset_job_ids: z.array(z.string()).optional(),
  writeset_path: z.string().nullable().optional(),
  handoff: z.string().nullable().optional(),
  cv: z.string().optional(),
  application_state: z.string().nullable().optional(),
  wait_reason: z.string().nullable().optional(),
  /** Search only: latest persistence requested for the current writeset. */
  registration: z
    .object({
      id: z.string().regex(DISPATCH_ID_RE),
      status: z.enum(DISPATCH_STATUSES),
      code: z.string().nullable(),
      result: persistResultSchema.nullable(),
    })
    .nullable()
    .optional(),
  /** Vaga indicada: the text the user typed (untrusted, plain text), the Lince's result and the diagnosis. */
  intake_text: z.string().max(1500).nullable().optional(),
  intake: intakeResultSchema.nullable().optional(),
  intake_state: z.enum(["missing", "invalid", "valid"]).optional(),
  diagnosis: z.array(diagnosisSchema).max(50).optional(),
  /** Who produced the diagnosis: "chatgpt" only on the host pipeline; the Bot path (Threadgist) has no proof. */
  diagnosis_by: z.enum(["chatgpt", "threadgist"]).optional(),
  /** Host pipelines (2026-09-30): current stage and, for "Preencher vaga", the prompt to paste in Claude in Chrome. */
  stage: z.string().nullable().optional(),
  discovery_code: z.string().nullable().optional(),
  claude_prompt: z.string().max(60_000).nullable().optional(),
  /** "Preencher vaga" since 2026-10-08: pending items for the user (the prompt is no longer pasted). */
  fill: fillSchema.nullable().optional(),
  claude_url: z.string().max(2000).nullable().optional(),
  // The résumé job-search registered for the job changed after the prompt was prepared: it points to the old PDF.
  prompt_stale: z.boolean().optional(),
  /** "Analisar": where job-search found the posting (runtime, dossiers, linkedin). */
  posting_source: z.string().max(40).nullable().optional(),
  /** "Pedir edição": the user's request (their own text, plain) and the PDF name the edit must produce. */
  edit_request: z.string().max(1500).nullable().optional(),
  edit_output: z.string().max(200).nullable().optional(),
  /** "Pedir edição" with the ChatGPT review (2026-10-05) and, stopped on them, the ChatGPT's doubts (plain text). */
  chatgpt_review: z.boolean().optional(),
  edit_doubts: z.array(z.string().max(300)).max(5).optional(),
  edit_mode: z.enum(["reassess", "request", "manual"]).optional(),
  proposal: cvProposalSchema.nullable().optional(),
  fit: cvFitSchema.nullable().optional(),
  edited: z.array(z.string().max(200)).max(80).nullable().optional(),
  /** "Gerar currículo" stuck in PRECISA_HUMANO (host): reason and resume options. */
  recovery: cvRecoverySchema.nullable().optional(),
})
export type DispatchProgress = z.infer<typeof progressSchema>

export const dispatchSchema = z.object({
  id: z.string().regex(DISPATCH_ID_RE),
  action: z.enum(DISPATCH_ACTIONS),
  platform: z.enum(RECORD_PLATFORMS),
  job_id: z.string().nullable(),
  status: z.enum(DISPATCH_STATUSES),
  code: z.string().nullable(),
  marker: z.string().nullable(),
  bot: z.string(),
  /** `host` = job-search pipeline on this machine (no gateway); `bot` = Hermes Bot Chat (legacy/fallback). */
  mode: z.enum(["host", "bot"]).optional(),
  renderer: z.enum(["claude_design", "local"]).optional(),
  edit_mode: z.enum(["reassess", "request", "manual"]).optional(),
  active: z.boolean(),
  acknowledged: z.boolean(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  progress: progressSchema,
  /** Only for Grok (manual paste): the fixed command text. */
  command: z.string().optional(),
  /**
   * REGISTRAR_WRITESET: the search or analysis it persists; ANALISAR_INDICADA: the LOCALIZAR_VAGA it analyses;
   * ANALISAR_DESCOBERTA: the BUSCAR_VAGAS that left the job out.
   */
  source_id: z.string().nullable().optional(),
  /** Vaga indicada discarded in the panel (nothing goes to the Sheet). */
  discarded: z.boolean().optional(),
  /** LOCALIZAR_VAGA: the NEEDS_CONTEXT intake this one complements, and the one that complemented it. */
  refines: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  refined_by: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  /** GERAR_CURRICULO: the stuck run this one resumes (and how), and the run that resumed this one. */
  resumes: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  resume_option: z.enum(CV_RESUME_OPTIONS).nullable().optional(),
  retried_by: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  /** EDITAR_CURRICULO: the newer edit of the same job that retired this pending proposal. */
  superseded_by: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  result: persistResultSchema.nullable().optional(),
})
export type Dispatch = z.infer<typeof dispatchSchema>

/**
 * `dispatch.py attention` ("Em andamento", 2026-10-07): job-search picks the newest record of each job+action that is
 * running, waiting on the user (terminal status not acknowledged) or holding a valid writeset not yet registered.
 * No progress and no bot text: the details stay on the job page.
 */
export const ATTENTION_KINDS = ["RUNNING", "NEEDS_USER", "WRITESET_PENDING"] as const
export type AttentionKind = (typeof ATTENTION_KINDS)[number]

export const attentionItemSchema = z.object({
  id: z.string().regex(DISPATCH_ID_RE),
  action: z.enum(DISPATCH_ACTIONS),
  platform: z.enum(RECORD_PLATFORMS),
  mode: z.enum(["host", "bot"]),
  job_id: z.string().regex(JOB_ID_RE).nullable(),
  source_id: z.string().regex(DISPATCH_ID_RE).nullable(),
  status: z.enum(DISPATCH_STATUSES),
  code: z.string().max(80).nullable(),
  created_at: z.string().max(40),
  finished_at: z.string().max(40).nullable(),
  kind: z.enum(ATTENTION_KINDS),
  writeset_job_ids: z.array(z.string().max(200)).max(200).optional(),
})
export type AttentionItem = z.infer<typeof attentionItemSchema>

export const attentionResultSchema = z.object({ ok: z.literal(true), items: z.array(attentionItemSchema).max(500) })

export const jobArtifactsSchema = z.object({
  job_id: z.string(),
  dossier: z.enum(["VALID", "MISSING"]),
  /** SELECIONADA and ABERTA: "Preencher vaga". */
  actionable: z.boolean(),
  /** A VALID dossier, any verdict and availability: "Gerar currículo" on the host. */
  cv_allowed: z.boolean(),
  cv: z.enum(["VALID", "MISSING", "INVALID"]),
  application_state: z.string().nullable(),
})
export type JobArtifacts = z.infer<typeof jobArtifactsSchema>

export const listResultSchema = z.object({
  ok: z.literal(true),
  gateway: z.string(),
  cv_renderer: z.enum(CV_RENDERERS).optional(),
  dispatches: z.array(dispatchSchema),
  job: jobArtifactsSchema.optional(),
})
export type DispatchList = z.infer<typeof listResultSchema>

export const oneResultSchema = z.object({ ok: z.literal(true), dispatch: dispatchSchema })

/** `dispatch.py delete <id>`: the intake lineage now hidden from `list` (local records only). */
export const deleteResultSchema = z.object({
  ok: z.literal(true),
  delete: z.object({
    id: z.string().regex(DISPATCH_ID_RE),
    deleted: z.array(z.string().regex(DISPATCH_ID_RE)).max(200),
  }),
})
export type DeleteResult = z.infer<typeof deleteResultSchema>["delete"]

/** `dispatch.py decline <job_id>`: job-search wrote RETIRADA (USER_DECLINED) to the Sheet. Fixed fields only. */
export const declineResultSchema = z.object({
  ok: z.literal(true),
  decline: z.object({ job_id: z.string().regex(JOB_ID_RE), status_candidatura: z.literal("RETIRADA") }),
})
export type DeclineResult = z.infer<typeof declineResultSchema>["decline"]

/**
 * "Registrar envio": the strong evidence the user saw after clicking the portal's final button. The only input besides
 * the job_id (no free text); mirrors job-search's `SENT_EVIDENCE` / `POSITIVE_EVIDENCE`.
 */
export const SENT_EVIDENCE = ["SUCCESS_PAGE", "PORTAL_SHOWS_APPLIED", "ATS_EMAIL_CONFIRMATION"] as const
export type SentEvidence = (typeof SENT_EVIDENCE)[number]

/** `dispatch.py record-sent <job_id> --evidence <tipo>`: job-search wrote ENVIADA to the Sheet. Fixed fields only. */
export const recordSentResultSchema = z.object({
  ok: z.literal(true),
  record_sent: z.object({ job_id: z.string().regex(JOB_ID_RE), status_candidatura: z.literal("ENVIADA") }),
})
export type RecordSentResult = z.infer<typeof recordSentResultSchema>["record_sent"]

/** `dispatch.py confirm-open <job_id>`: job-search wrote ABERTA to the Sheet and the dossier. Fixed fields only. */
export const confirmOpenResultSchema = z.object({
  ok: z.literal(true),
  confirm_open: z.object({
    job_id: z.string().regex(JOB_ID_RE),
    status_disponibilidade: z.literal("ABERTA"),
    sheet: z.enum(["UPDATED", "UNCHANGED"]),
  }),
})
export type ConfirmOpenResult = z.infer<typeof confirmOpenResultSchema>["confirm_open"]

/** `dispatch.py mark-closed <job_id>`: job-search wrote ENCERRADA to the Sheet and the dossier. Fixed fields only. */
export const markClosedResultSchema = z.object({
  ok: z.literal(true),
  mark_closed: z.object({
    job_id: z.string().regex(JOB_ID_RE),
    status_disponibilidade: z.literal("ENCERRADA"),
    sheet: z.enum(["UPDATED", "UNCHANGED"]),
  }),
})
export type MarkClosedResult = z.infer<typeof markClosedResultSchema>["mark_closed"]

/**
 * `dispatch.py open-browser clouddesign`: job-search opened the Cloud Design Chrome (CDP 9226), as the desktop
 * shortcut does, or found it already open. Only the browser name and whether it was already open.
 */
export const openBrowserResultSchema = z.object({
  ok: z.literal(true),
  open_browser: z.object({ browser: z.enum(["clouddesign", "application"]), already_open: z.boolean() }),
})
export type OpenBrowserResult = z.infer<typeof openBrowserResultSchema>["open_browser"]

const rowCount = z.number().int().nonnegative()

/**
 * `dispatch.py delete-job <job_id>`: job-search deleted the job's rows from the Sheet (main tab, Eventos de
 * Candidatura, Dossiers) after a local backup. Fixed fields only: the job_id and how many rows left each tab.
 */
export const deleteJobResultSchema = z.object({
  ok: z.literal(true),
  delete_job: z.object({
    job_id: z.string().regex(JOB_ID_RE),
    principal: rowCount,
    eventos: rowCount,
    dossiers: rowCount,
  }),
})
export type DeleteJobResult = z.infer<typeof deleteJobResultSchema>["delete_job"]

/**
 * `dispatch.py cv-file <job_id>`: the résumé PDF job-search registered for the job (`cv.json` passing `cv_export
 * verify`, file inside the résumé folder). `path` stays on the server: the client only gets `CvFileInfo`.
 */
export const cvFileResultSchema = z.object({
  ok: z.literal(true),
  cv_file: z.object({
    job_id: z.string().regex(JOB_ID_RE),
    path: z.string().min(1).max(1000),
    filename: z.string().regex(/^[a-z0-9_-]+\.pdf$/),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    exported_at: z.string().max(40),
  }),
})
export type CvFile = z.infer<typeof cvFileResultSchema>["cv_file"]
export type CvFileInfo = Omit<CvFile, "path">

export const refusalSchema = z.object({
  ok: z.literal(false),
  code: z.string().max(80),
  detail: z.string().max(300).optional(),
})
export type DispatchRefusal = z.infer<typeof refusalSchema>

export const startInputSchema = z
  .object({
    action: z.enum(BOT_ACTIONS),
    platform: z.enum(PLATFORMS),
    jobId: z.string().regex(JOB_ID_RE).optional(),
  })
  .strict()
  .refine((input) => PER_JOB_ACTIONS.includes(input.action) === (input.jobId !== undefined), {
    message: "jobId is required exactly for per-job actions",
  })
export type StartInput = z.infer<typeof startInputSchema>
