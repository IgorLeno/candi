"use server"

import { updateTag } from "next/cache"
import { z } from "zod"
import { getAllowedSession } from "@/lib/auth/session"
import { JOB_SEARCH_CACHE_TAG, getJobSearchData } from "@/lib/job-search/source"
import { toListItem } from "@/lib/job-search/present"
import { runDispatcher, type RunResult } from "@/lib/ops/dispatcher"
import { INTAKE_MAX, normalizeIntake } from "@/lib/ops/intake"
import { jobDispatchBlocker } from "@/lib/ops/present"
import {
  ANALYZE_ACTION,
  DISPATCH_ACTIONS,
  DISPATCH_ID_RE,
  JOB_ID_RE,
  declineResultSchema,
  listResultSchema,
  oneResultSchema,
  startInputSchema,
  type DeclineResult,
  type Dispatch,
  type DispatchList,
} from "@/lib/ops/schema"

// Bot dispatch from the panel. Server Functions are not covered by `proxy.ts`: every action checks the
// session itself, before touching input or the dispatcher. Nothing typed by the client becomes bot text:
// the dispatcher sends fixed commands and only receives an action, a platform and a validated job_id. The one
// exception is the "vaga indicada" text: guarded here, sent over stdin, stored by job-search as untrusted data.

async function requireSession(): Promise<void> {
  if (!(await getAllowedSession())) throw new Error("UNAUTHENTICATED")
}

type ActionResult<T> = { ok: true; value: T } | { ok: false; code: string }

function strip<T>(result: RunResult<T>): ActionResult<T> {
  return result.ok ? result : { ok: false, code: result.code }
}

export async function startDispatch(input: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  const parsed = startInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" }
  const { action, platform, jobId } = parsed.data
  if (jobId !== undefined) {
    // The job must exist in the current (read-only) Sheet snapshot and not be closed, sent or uncertain.
    const data = await getJobSearchData()
    const view = data.views.find((item) => item.job.job_id === jobId)
    if (!view) return { ok: false, code: "JOB_NOT_FOUND" }
    if (jobDispatchBlocker(toListItem(view))) return { ok: false, code: "JOB_BLOCKED" }
  }
  const args = ["start", action, "--platform", platform, ...(jobId ? ["--job-id", jobId] : [])]
  const result = await runDispatcher(args, oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

const listInputSchema = z
  .object({
    jobId: z.string().regex(JOB_ID_RE).optional(),
    action: z.enum(DISPATCH_ACTIONS).optional(),
  })
  .strict()

export async function listDispatches(input: unknown): Promise<ActionResult<DispatchList>> {
  await requireSession()
  const parsed = listInputSchema.safeParse(input ?? {})
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" }
  const { jobId, action } = parsed.data
  const args = ["list", "--limit", "5", ...(jobId ? ["--job-id", jobId] : []), ...(action ? ["--action", action] : [])]
  return strip(await runDispatcher(args, listResultSchema))
}

/**
 * "Registrar na planilha": asks job-search to persist a search's writeset (`dispatch.py persist <id>`). The
 * dispatcher checks the writeset (`writeset.py check` VALID) and runs `writeset.py persist` with job-search's
 * own write credential; the panel sends only the search id and never writes to the Sheet.
 */
export async function registerWriteset(searchId: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof searchId !== "string" || !DISPATCH_ID_RE.test(searchId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["persist", searchId], oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

export async function ackDispatch(id: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof id !== "string" || !DISPATCH_ID_RE.test(id)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["ack", id], oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/**
 * "Indicar vaga": asks the Lince (Hermes only) to locate one specific job described in free text and run the
 * prefilter. The text goes over stdin, never argv; job-search re-applies the same guards and writes it to a
 * private file marked as untrusted data. The bot command stays fixed and only points to that file.
 */
export async function startIntake(text: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof text !== "string" || text.length > INTAKE_MAX * 4) return { ok: false, code: "INPUT_INVALID" }
  const intake = normalizeIntake(text)
  if (!intake.ok) return { ok: false, code: intake.code }
  const args = ["start", "LOCALIZAR_VAGA", "--platform", "hermes", "--intake-stdin"]
  const result = await runDispatcher(args, oneResultSchema, undefined, { stdin: intake.text })
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/** "Mandar para o ChatGPT": the Lince takes the located job to the Threadgist (Hermes only). Only the id. */
export async function analyzeIntake(intakeId: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof intakeId !== "string" || !DISPATCH_ID_RE.test(intakeId)) return { ok: false, code: "INPUT_INVALID" }
  const args = ["start", "ANALISAR_INDICADA", "--platform", "hermes", "--from", intakeId]
  const result = await runDispatcher(args, oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/**
 * "Analisar": asks job-search to analyse one job already in the Sheet with the ChatGPT (host pipeline, Hermes only).
 * Only the job_id leaves the panel: job-search reads the row and the posting itself and writes a writeset that the
 * user registers later ("Registrar na planilha"). Allowed for sent jobs too (the goal is the dossier).
 */
export async function analyzeJob(jobId: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const data = await getJobSearchData()
  if (!data.views.some((item) => item.job.job_id === jobId)) return { ok: false, code: "JOB_NOT_FOUND" }
  const args = ["start", ANALYZE_ACTION, "--platform", "hermes", "--job-id", jobId]
  const result = await runDispatcher(args, oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/** "Descartar" a vaga indicada: job-search only marks its records; nothing goes to the Sheet. */
export async function discardDispatch(id: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof id !== "string" || !DISPATCH_ID_RE.test(id)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["discard", id], oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/**
 * "Descartar vaga": the user will not apply. job-search (`dispatch.py decline` → `application.py decline`) writes
 * RETIRADA with a CLOSED/USER_DECLINED event, using its own credential; the panel sends only the job_id. The
 * Sheet snapshot is dropped afterwards so the card shows the discarded state. There is no undo.
 */
export async function declineJob(jobId: unknown): Promise<ActionResult<DeclineResult>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["decline", jobId], declineResultSchema)
  // Uncertain or failed writes may still have landed: re-read the Sheet either way.
  updateTag(JOB_SEARCH_CACHE_TAG)
  return result.ok ? { ok: true, value: result.value.decline } : { ok: false, code: result.code }
}
