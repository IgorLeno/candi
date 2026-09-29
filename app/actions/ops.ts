"use server"

import { z } from "zod"
import { getAllowedSession } from "@/lib/auth/session"
import { getJobSearchData } from "@/lib/job-search/source"
import { toListItem } from "@/lib/job-search/present"
import { runDispatcher, type RunResult } from "@/lib/ops/dispatcher"
import { jobDispatchBlocker } from "@/lib/ops/present"
import {
  DISPATCH_ACTIONS,
  DISPATCH_ID_RE,
  JOB_ID_RE,
  listResultSchema,
  oneResultSchema,
  startInputSchema,
  type Dispatch,
  type DispatchList,
} from "@/lib/ops/schema"

// Bot dispatch from the panel. Server Functions are not covered by `proxy.ts`: every action checks the
// session itself, before touching input or the dispatcher. Nothing typed by the client becomes bot text:
// the dispatcher sends fixed commands and only receives an action, a platform and a validated job_id.

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

export async function ackDispatch(id: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof id !== "string" || !DISPATCH_ID_RE.test(id)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["ack", id], oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}
