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
 * Every record kind in the dispatcher's list. REGISTRAR_WRITESET is not a bot: it is `dispatch.py persist`,
 * where job-search runs `writeset.py persist` with its own write credential at the user's request.
 */
export const DISPATCH_ACTIONS = [...BOT_ACTIONS, ...INTAKE_ACTIONS, ANALYZE_ACTION, "REGISTRAR_WRITESET"] as const
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
})
export type Diagnosis = z.infer<typeof diagnosisSchema>

const progressSchema = z.object({
  percent: z.number().min(0).max(100),
  stages: z.array(stageSchema),
  candidates: z.number().nullable().optional(),
  excluded: z.number().nullable().optional(),
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
  /** Host pipelines (2026-09-30): current stage and, for "Preencher vaga", the prompt to paste in Claude in Chrome. */
  stage: z.string().nullable().optional(),
  discovery_code: z.string().nullable().optional(),
  claude_prompt: z.string().max(60_000).nullable().optional(),
  claude_url: z.string().max(2000).nullable().optional(),
  /** "Analisar": where job-search found the posting (runtime, dossiers, linkedin). */
  posting_source: z.string().max(40).nullable().optional(),
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
  active: z.boolean(),
  acknowledged: z.boolean(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  progress: progressSchema,
  /** Only for Grok (manual paste): the fixed command text. */
  command: z.string().optional(),
  /** REGISTRAR_WRITESET: the search or analysis it persists; ANALISAR_INDICADA: the LOCALIZAR_VAGA it analyses. */
  source_id: z.string().nullable().optional(),
  /** Vaga indicada discarded in the panel (nothing goes to the Sheet). */
  discarded: z.boolean().optional(),
  /** LOCALIZAR_VAGA: the NEEDS_CONTEXT intake this one complements, and the one that complemented it. */
  refines: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  refined_by: z.string().regex(DISPATCH_ID_RE).nullable().optional(),
  result: persistResultSchema.nullable().optional(),
})
export type Dispatch = z.infer<typeof dispatchSchema>

export const jobArtifactsSchema = z.object({
  job_id: z.string(),
  dossier: z.enum(["VALID", "MISSING"]),
  actionable: z.boolean(),
  cv: z.enum(["VALID", "MISSING", "INVALID"]),
  application_state: z.string().nullable(),
})
export type JobArtifacts = z.infer<typeof jobArtifactsSchema>

export const listResultSchema = z.object({
  ok: z.literal(true),
  gateway: z.string(),
  dispatches: z.array(dispatchSchema),
  job: jobArtifactsSchema.optional(),
})
export type DispatchList = z.infer<typeof listResultSchema>

export const oneResultSchema = z.object({ ok: z.literal(true), dispatch: dispatchSchema })

/** `dispatch.py decline <job_id>`: job-search wrote RETIRADA (USER_DECLINED) to the Sheet. Fixed fields only. */
export const declineResultSchema = z.object({
  ok: z.literal(true),
  decline: z.object({ job_id: z.string().regex(JOB_ID_RE), status_candidatura: z.literal("RETIRADA") }),
})
export type DeclineResult = z.infer<typeof declineResultSchema>["decline"]

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
