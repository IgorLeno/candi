import type { Tone } from "@/lib/job-search/present"
import { ACTION_META, STATUS_META } from "@/lib/ops/present"
import type { AttentionItem, AttentionKind, DispatchAction, DispatchStatus } from "@/lib/ops/schema"

// "Em andamento" (2026-10-07): job-search's `dispatch.py attention` decides what runs or waits on the user (newest
// record per job+action, `acknowledged` retires it). Here only names, links, labels and order; no rule recomputed.

export interface AttentionEntry {
  id: string
  action: DispatchAction
  kind: AttentionKind
  status: DispatchStatus
  jobId: string | null
  /** Company and title from the read-only Sheet snapshot; null when the job is not (or no longer) in it. */
  empresa: string | null
  cargo: string | null
  href: string
}

export interface AttentionJob {
  empresa: string
  cargo: string
}

/**
 * Joins the items with the Sheet snapshot. A search's writeset whose jobs are all in the Sheet was persisted outside
 * the panel (the coordinator): the same check the "Cotar vagas" card makes (`withRegistration`). Items waiting on the
 * user come first; each group keeps job-search's order (newest first).
 */
export function attentionEntries(items: AttentionItem[], jobs: ReadonlyMap<string, AttentionJob>): AttentionEntry[] {
  const entries = items
    .filter(
      (item) =>
        !(
          item.kind === "WRITESET_PENDING" &&
          item.action === "BUSCAR_VAGAS" &&
          (item.writeset_job_ids ?? []).length > 0 &&
          (item.writeset_job_ids ?? []).every((id) => jobs.has(id))
        )
    )
    .map((item) => {
      const job = item.job_id ? jobs.get(item.job_id) : undefined
      return {
        id: item.id,
        action: item.action,
        kind: item.kind,
        status: item.status,
        jobId: item.job_id,
        empresa: job?.empresa || null,
        cargo: job?.cargo || null,
        href: item.job_id ? `/vaga/${encodeURIComponent(item.job_id)}` : "/cotar",
      }
    })
  return [
    ...entries.filter((entry) => entry.kind !== "RUNNING"),
    ...entries.filter((entry) => entry.kind === "RUNNING"),
  ]
}

export function needsUserCount(entries: AttentionEntry[]): number {
  return entries.filter((entry) => entry.kind !== "RUNNING").length
}

/** Status label and tone: job-search's status, or "Falta registrar" for a writeset not yet in the Sheet. */
export function attentionBadge(entry: Pick<AttentionEntry, "kind" | "status">): { label: string; tone: Tone } {
  if (entry.kind === "WRITESET_PENDING") return { label: "Falta registrar", tone: "warning" }
  return STATUS_META[entry.status]
}

/** What the line names: the company (or the job_id) and the action; searches and intakes by the action only. */
export function attentionTitle(entry: Pick<AttentionEntry, "action" | "jobId" | "empresa">): string {
  return entry.jobId ? (entry.empresa ?? entry.jobId) : ACTION_META[entry.action].label
}

/**
 * Items that started waiting on the user since the previous read, for the toast. Never on the first read (`previous`
 * null) and never for what the current page already shows: that job's page, or "Cotar vagas" for searches and intakes.
 */
export function newlyWaiting(
  previous: ReadonlySet<string> | null,
  entries: AttentionEntry[],
  pathname: string
): AttentionEntry[] {
  if (previous === null) return []
  const page = safeDecode(pathname)
  return entries.filter((entry) => {
    if (entry.kind === "RUNNING" || previous.has(entry.id)) return false
    if (entry.jobId === null) return !page.startsWith("/cotar")
    return page !== `/vaga/${entry.jobId}`
  })
}

function safeDecode(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

export function waitingIds(entries: AttentionEntry[]): Set<string> {
  return new Set(entries.filter((entry) => entry.kind !== "RUNNING").map((entry) => entry.id))
}

/** Fired by a job page whose dispatch list changed, so the sidebar re-reads now instead of on its next poll. */
export const ATTENTION_REFRESH_EVENT = "candi:attention-refresh"
