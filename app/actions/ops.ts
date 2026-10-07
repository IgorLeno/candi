"use server"

import { updateTag } from "next/cache"
import { z } from "zod"
import { getAllowedSession } from "@/lib/auth/session"
import { JOB_SEARCH_CACHE_TAG, getJobSearchData } from "@/lib/job-search/source"
import { cvFileInfo } from "@/lib/ops/cv-file"
import { normalizeManualEdits } from "@/lib/ops/cv-manual"
import { runDispatcher, type RunResult } from "@/lib/ops/dispatcher"
import { INTAKE_MAX, normalizeIntake } from "@/lib/ops/intake"
import {
  ANALYZE_ACTION,
  CV_RESUME_OPTIONS,
  DISPATCH_ACTIONS,
  DISPATCH_ID_RE,
  JOB_ID_RE,
  LEFT_OUT_ACTION,
  CV_EDIT_ACTION,
  PLATFORMS,
  SENT_EVIDENCE,
  confirmOpenResultSchema,
  cvDocResultSchema,
  declineResultSchema,
  deleteJobResultSchema,
  deleteResultSchema,
  listResultSchema,
  markClosedResultSchema,
  oneResultSchema,
  openBrowserResultSchema,
  recordSentResultSchema,
  startInputSchema,
  type ConfirmOpenResult,
  type CvFileInfo,
  type CvDoc,
  type DeclineResult,
  type DeleteJobResult,
  type DeleteResult,
  type Dispatch,
  type DispatchList,
  type MarkClosedResult,
  type OpenBrowserResult,
  type RecordSentResult,
} from "@/lib/ops/schema"

// Bot dispatch from the panel. Server Functions are not covered by `proxy.ts`: every action checks the
// session itself, before touching input or the dispatcher. Nothing typed by the client becomes bot text:
// the dispatcher sends fixed commands and only receives an action, a platform and a validated job_id. The two
// exceptions are the "vaga indicada" text and the note that resumes a stuck résumé ("Outro"): guarded here, sent
// over stdin, stored by job-search as untrusted data.

async function requireSession(): Promise<void> {
  if (!(await getAllowedSession())) throw new Error("UNAUTHENTICATED")
}

type ActionResult<T> = { ok: true; value: T } | { ok: false; code: string }

function strip<T>(result: RunResult<T>): ActionResult<T> {
  return result.ok ? result : { ok: false, code: result.code }
}

/** A refusal of "Preencher vaga" because another job's application holds the slot carries that job_id. */
export type StartResult = ActionResult<Dispatch> | { ok: false; code: string; blocker: string }

export async function startDispatch(input: unknown): Promise<StartResult> {
  await requireSession()
  const parsed = startInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" }
  const { action, platform, jobId } = parsed.data
  if (jobId !== undefined) {
    // The job must exist in the current (read-only) Sheet snapshot. Its verdict, availability and application state
    // never block (the user chooses, decision 2026-10-02); job-search checks the analysis (dossier) itself.
    const data = await getJobSearchData()
    if (!data.views.some((item) => item.job.job_id === jobId)) return { ok: false, code: "JOB_NOT_FOUND" }
  }
  const args = ["start", action, "--platform", platform, ...(jobId ? ["--job-id", jobId] : [])]
  const result = await runDispatcher(args, oneResultSchema)
  if (result.ok) return { ok: true, value: result.value.dispatch }
  // Only a validated job_id goes back to the client; any other detail stays on the server.
  if (result.code === "APPLICATION_DISPATCH_ACTIVE" && result.detail && JOB_ID_RE.test(result.detail)) {
    return { ok: false, code: result.code, blocker: result.detail }
  }
  return { ok: false, code: result.code }
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

// One choice per complement: a candidate the Lince listed (by its position) or the "Outro" text.
const refineChoiceSchema = z.union([
  z.object({ candidate: z.number().int().min(1).max(5) }).strict(),
  z.object({ text: z.string().max(INTAKE_MAX * 4) }).strict(),
])

/**
 * "Escolher candidata / Outro" on a NEEDS_CONTEXT intake: job-search writes a new indication made of the original
 * text plus this complement (still untrusted data) and runs the Lince again. A candidate goes only as its number
 * (job-search reads the candidate from its own file); the "Outro" text goes over stdin, never argv.
 */
export async function refineIntake(intakeId: unknown, choice: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  const parsed = refineChoiceSchema.safeParse(choice)
  if (typeof intakeId !== "string" || !DISPATCH_ID_RE.test(intakeId) || !parsed.success) {
    return { ok: false, code: "INPUT_INVALID" }
  }
  const args = ["start", "LOCALIZAR_VAGA", "--platform", "hermes", "--from", intakeId]
  if ("candidate" in parsed.data) {
    const result = await runDispatcher([...args, "--candidate", String(parsed.data.candidate)], oneResultSchema)
    return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
  }
  const complement = normalizeIntake(parsed.data.text)
  if (!complement.ok) return { ok: false, code: complement.code }
  const result = await runDispatcher([...args, "--intake-stdin"], oneResultSchema, undefined, {
    stdin: complement.text,
  })
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

// One choice per resume: an option job-search offered, or "Outro" = a new ChatGPT patch with the user's note.
const resumeCvChoiceSchema = z.union([
  z.object({ option: z.enum(CV_RESUME_OPTIONS) }).strict(),
  z.object({ note: z.string().max(INTAKE_MAX * 4) }).strict(),
])

/**
 * "Tentar de novo" on a stuck "Gerar currículo": job-search starts a new run with the chosen option and retires the
 * stuck card. "Outro" goes as `--option chatgpt` with the note over stdin, never argv; job-search re-applies the
 * guards and keeps it as untrusted data that the ChatGPT prompt quotes as the user's guidance.
 */
export async function resumeCv(dispatchId: unknown, choice: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  const parsed = resumeCvChoiceSchema.safeParse(choice)
  if (typeof dispatchId !== "string" || !DISPATCH_ID_RE.test(dispatchId) || !parsed.success) {
    return { ok: false, code: "INPUT_INVALID" }
  }
  const args = ["resume-cv", dispatchId, "--option"]
  if ("option" in parsed.data) {
    const result = await runDispatcher([...args, parsed.data.option], oneResultSchema)
    return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
  }
  const note = normalizeIntake(parsed.data.note)
  if (!note.ok) return { ok: false, code: note.code }
  const result = await runDispatcher([...args, "chatgpt", "--note-stdin"], oneResultSchema, undefined, {
    stdin: note.text,
  })
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

const cvEditInputSchema = z
  .object({ platform: z.enum(PLATFORMS), text: z.string().max(12_000), chatgptReview: z.boolean().optional() })
  .strict()
const cvLocalEditInputSchema = z.object({ text: z.string().max(12_000) }).strict()

/**
 * "Pedir edição": the user's own edit of this job's résumé (decision 2026-10-03, option B, no ChatGPT). The job must
 * be in the Sheet; the text gets the same guards as the "vaga indicada" and goes over stdin, never argv. job-search
 * checks again, stores it as a private file and builds the edit for Claude in Chrome; Grok gets a fixed command.
 * `chatgptReview` (decision 2026-10-05, Hermes only) adds the fixed `--chatgpt-review` flag: job-search has the ChatGPT
 * turn the request into a checked patch before Claude, and stops with its doubts.
 */
export async function editCv(jobId: unknown, input: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  const local = cvLocalEditInputSchema.safeParse(input)
  if (local.success) {
    if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
    const request = normalizeIntake(local.data.text)
    if (!request.ok) return { ok: false, code: request.code.replace("INTAKE_", "REQUEST_") }
    const data = await getJobSearchData()
    if (!data.views.some((item) => item.job.job_id === jobId)) return { ok: false, code: "JOB_NOT_FOUND" }
    const result = await runDispatcher(
      ["start", CV_EDIT_ACTION, "--platform", "hermes", "--job-id", jobId, "--request-stdin"],
      oneResultSchema,
      undefined,
      { stdin: request.text }
    )
    return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
  }
  const parsed = cvEditInputSchema.safeParse(input)
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId) || !parsed.success)
    return { ok: false, code: "INPUT_INVALID" }
  const review = parsed.data.chatgptReview === true
  if (review && parsed.data.platform !== "hermes") return { ok: false, code: "CHATGPT_REVIEW_HERMES_ONLY" }
  const request = normalizeIntake(parsed.data.text)
  if (!request.ok) return { ok: false, code: request.code.replace("INTAKE_", "REQUEST_") }
  const data = await getJobSearchData()
  if (!data.views.some((item) => item.job.job_id === jobId)) return { ok: false, code: "JOB_NOT_FOUND" }
  const args = ["start", CV_EDIT_ACTION, "--platform", parsed.data.platform, "--job-id", jobId, "--request-stdin"]
  if (review) args.push("--chatgpt-review")
  const result = await runDispatcher(args, oneResultSchema, undefined, { stdin: request.text })
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/** Second ChatGPT assessment of this job's current local résumé, without a user comment. */
export async function reassessCv(jobId: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const data = await getJobSearchData()
  if (!data.views.some((item) => item.job.job_id === jobId)) return { ok: false, code: "JOB_NOT_FOUND" }
  const result = await runDispatcher(
    ["start", CV_EDIT_ACTION, "--platform", "hermes", "--job-id", jobId, "--reassess"],
    oneResultSchema
  )
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

/** The selected change numbers go in argv; all patch text remains in job-search's private proposal. */
export async function applyCvChanges(dispatchId: unknown, approved: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (
    typeof dispatchId !== "string" ||
    !DISPATCH_ID_RE.test(dispatchId) ||
    !Array.isArray(approved) ||
    approved.length > 30 ||
    approved.some((n) => !Number.isInteger(n) || n < 1 || n > 99) ||
    new Set(approved).size !== approved.length
  )
    return { ok: false, code: "INPUT_INVALID" }
  const selection = approved.length ? approved.join(",") : "none"
  const result = await runDispatcher(["apply-cv-changes", dispatchId, "--approve", selection], oneResultSchema)
  return result.ok ? { ok: true, value: result.value.dispatch } : { ok: false, code: result.code }
}

export async function getCvDoc(jobId: unknown): Promise<ActionResult<CvDoc>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["cv-doc", jobId], cvDocResultSchema)
  return result.ok ? { ok: true, value: result.value.cv_doc } : { ok: false, code: result.code }
}

const manualInputSchema = z
  .object({
    docSha256: z.string().regex(/^[0-9a-f]{64}$/),
    edits: z
      .array(z.object({ path: z.string(), text: z.string() }).strict())
      .min(1)
      .max(80),
  })
  .strict()

export async function saveCvManual(jobId: unknown, input: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const parsed = manualInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, code: "MANUAL_INVALID" }
  const current = await runDispatcher(["cv-doc", jobId], cvDocResultSchema)
  if (!current.ok) return { ok: false, code: current.code }
  const doc = current.value.cv_doc
  if (doc.doc_sha256 !== parsed.data.docSha256) return { ok: false, code: "CV_DOC_CHANGED" }
  const checked = normalizeManualEdits(doc, parsed.data.edits)
  if (!checked.ok) return checked
  const payload = JSON.stringify({ doc_sha256: doc.doc_sha256, edits: checked.edits })
  if (new TextEncoder().encode(payload).length > 24 * 1024) return { ok: false, code: "MANUAL_INVALID" }
  const result = await runDispatcher(
    ["start", CV_EDIT_ACTION, "--platform", "hermes", "--job-id", jobId, "--manual-stdin"],
    oneResultSchema,
    undefined,
    { stdin: payload }
  )
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

/**
 * "Mandar ao ChatGPT" a job the search left out (prefilter, budget, closed): the prefilter verdict never blocks
 * (decision 2026-10-03). Only the search id and the job_id leave the panel: job-search checks the job is among that
 * search's left-out jobs, fetches the full text itself and leaves a writeset to register ("Registrar na planilha").
 */
export async function analyzeLeftOut(searchId: unknown, jobId: unknown): Promise<ActionResult<Dispatch>> {
  await requireSession()
  if (typeof searchId !== "string" || !DISPATCH_ID_RE.test(searchId)) return { ok: false, code: "INPUT_INVALID" }
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const args = ["start", LEFT_OUT_ACTION, "--platform", "hermes", "--from", searchId, "--job-id", jobId]
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
 * "Excluir" a vaga indicada: `dispatch.py delete <id>` hides the whole intake lineage from `list`. Local dispatch
 * records only; nothing goes to the Sheet. The panel has no undo.
 */
export async function deleteDispatch(id: unknown): Promise<ActionResult<DeleteResult>> {
  await requireSession()
  if (typeof id !== "string" || !DISPATCH_ID_RE.test(id)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["delete", id], deleteResultSchema)
  return result.ok ? { ok: true, value: result.value.delete } : { ok: false, code: result.code }
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

/**
 * "Confirmei que está aberta": the user checked the posting page. job-search (`dispatch.py confirm-open`) writes
 * status_disponibilidade ABERTA to the Sheet (writeset with a USER_CONFIRMED reconciliation) and to the dossier,
 * with its own credential; the panel sends only the job_id. Only for NÃO CONFIRMADA: job-search reads availability
 * by itself on LinkedIn only, so a careers-site job would never reach the résumé or the application otherwise.
 */
export async function confirmJobOpen(jobId: unknown): Promise<ActionResult<ConfirmOpenResult>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["confirm-open", jobId], confirmOpenResultSchema)
  // Uncertain or failed writes may still have landed: re-read the Sheet either way.
  updateTag(JOB_SEARCH_CACHE_TAG)
  return result.ok ? { ok: true, value: result.value.confirm_open } : { ok: false, code: result.code }
}

/**
 * "Vaga encerrada": the user saw that the job no longer takes applications (on the posting, or Claude in Chrome said
 * so while filling). job-search (`dispatch.py mark-closed`) writes status_disponibilidade ENCERRADA to the Sheet
 * (writeset with a USER_CONFIRMED reconciliation) and to the dossier; the application is left as it is. The panel
 * sends only the job_id. "Confirmei que está aberta" undoes it.
 */
export async function markJobClosed(jobId: unknown): Promise<ActionResult<MarkClosedResult>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["mark-closed", jobId], markClosedResultSchema)
  // Uncertain or failed writes may still have landed: re-read the Sheet either way.
  updateTag(JOB_SEARCH_CACHE_TAG)
  return result.ok ? { ok: true, value: result.value.mark_closed } : { ok: false, code: result.code }
}

/**
 * "Registrar envio": the user clicked the portal's final button (Claude in Chrome stops before it) and says which
 * strong evidence they saw. job-search (`dispatch.py record-sent` → `application.py record-panel-submit`) writes
 * ENVIADA and a SUBMITTED event with its own credential; the panel sends only the job_id and an evidence from a fixed
 * list, never free text. There is no undo.
 */
export async function recordSent(jobId: unknown, evidence: unknown): Promise<ActionResult<RecordSentResult>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const parsed = z.enum(SENT_EVIDENCE).safeParse(evidence)
  if (!parsed.success) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["record-sent", jobId, "--evidence", parsed.data], recordSentResultSchema)
  // An uncertain write may have landed: re-read the Sheet either way.
  updateTag(JOB_SEARCH_CACHE_TAG)
  return result.ok ? { ok: true, value: result.value.record_sent } : { ok: false, code: result.code }
}

/**
 * "Abrir navegador do currículo": job-search (`dispatch.py open-browser clouddesign`) runs the same command as the
 * Cloud Design Browser shortcut and checks the CDP. No input from the client: the browser name is fixed here. Signing
 * in to Claude and opening its panel on the PT/EN tabs stay with the user.
 */
export async function openCvBrowser(): Promise<ActionResult<OpenBrowserResult>> {
  await requireSession()
  const result = await runDispatcher(["open-browser", "clouddesign"], openBrowserResultSchema)
  return result.ok ? { ok: true, value: result.value.open_browser } : { ok: false, code: result.code }
}

/**
 * "Abrir navegador da candidatura": job-search (`dispatch.py open-browser application`) runs the same command as the
 * Application Browser shortcut (the Chrome with Claude in Chrome, CDP 9227) and checks the CDP. No input from the
 * client: the browser name is fixed here. Signing in to Claude and to the job portals stays with the user.
 */
export async function openApplicationBrowser(): Promise<ActionResult<OpenBrowserResult>> {
  await requireSession()
  const result = await runDispatcher(["open-browser", "application"], openBrowserResultSchema)
  return result.ok ? { ok: true, value: result.value.open_browser } : { ok: false, code: result.code }
}

/**
 * "Excluir vaga": the job leaves the Sheet. job-search (`dispatch.py delete-job` → `application.py delete`) backs the
 * rows up locally, then deletes the main-tab row and its Eventos/Dossiers rows with its own credential; the panel
 * sends only the job_id. The Sheet snapshot is dropped afterwards whatever the answer. There is no undo.
 */
export async function deleteJob(jobId: unknown): Promise<ActionResult<DeleteJobResult>> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["delete-job", jobId], deleteJobResultSchema)
  // A partial or uncertain delete may have removed rows: re-read the Sheet either way.
  updateTag(JOB_SEARCH_CACHE_TAG)
  return result.ok ? { ok: true, value: result.value.delete_job } : { ok: false, code: result.code }
}

/**
 * "Currículo" section: which résumé PDF job-search registered for this job (name, size, date), for the preview. The
 * file path stays on the server; the PDF itself is served by `/api/vaga/[job_id]/curriculo`.
 */
export async function getCvFile(jobId: unknown): Promise<ActionResult<CvFileInfo> & { detail?: string }> {
  await requireSession()
  if (typeof jobId !== "string" || !JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const info = await cvFileInfo(jobId)
  if (!info.ok) return { ok: false, code: info.code, detail: info.detail }
  const { job_id, filename, size, sha256, exported_at } = info.file
  return { ok: true, value: { job_id, filename, size, sha256, exported_at } }
}
