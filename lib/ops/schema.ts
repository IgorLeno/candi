import { z } from "zod"

// Contract of `job-search/hermes/browsers/dispatch.py` (JSON on stdout). The dispatcher is the authority
// on actions, preconditions and progress; this file only validates what comes back before it reaches the UI.

/** Work the panel can ask a bot to start (`dispatch.py start`). */
export const BOT_ACTIONS = ["BUSCAR_VAGAS", "GERAR_CURRICULO", "PREENCHER_CANDIDATURA"] as const
export type BotAction = (typeof BOT_ACTIONS)[number]

/**
 * Every record kind in the dispatcher's list. REGISTRAR_WRITESET is not a bot: it is `dispatch.py persist`,
 * where job-search runs `writeset.py persist` with its own write credential at the user's request.
 */
export const DISPATCH_ACTIONS = [...BOT_ACTIONS, "REGISTRAR_WRITESET"] as const
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
  active: z.boolean(),
  acknowledged: z.boolean(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  progress: progressSchema,
  /** Only for Grok (manual paste): the fixed command text. */
  command: z.string().optional(),
  /** Only for REGISTRAR_WRITESET: the search it persists and the counts. */
  source_id: z.string().nullable().optional(),
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
