import { RESULTADO_COBERTURA, type ResultadoCobertura } from "@/lib/job-search/enums"
import { enumText, isInvalid } from "@/lib/job-search/sheet-parse"
import type { CoverageRow, EnumCell, IssueCode, JobSearchData, JobView } from "@/lib/job-search/types"

// Pure aggregations, recomputed on every read; nothing here is persisted.

export const INVALID_BUCKET = "INVÁLIDO"
export const EMPTY_BUCKET = "(vazio)"

export interface Period {
  /** Inclusive YYYY-MM-DD bounds; omitted bound = open. */
  from?: string
  to?: string
}

export function inPeriod(date: string | null, period: Period): boolean {
  if (!period.from && !period.to) return true
  if (!date) return false
  return (!period.from || date >= period.from) && (!period.to || date <= period.to)
}

/** Period filter by first analysis date (the job's entry into the registry). */
export function filterByPeriod(views: JobView[], period: Period): JobView[] {
  return views.filter((view) => inPeriod(view.job.data_primeira_analise, period))
}

const PREPARATION_OR_BEYOND = new Set(["EM PREPARAÇÃO", "PRONTA PARA REVISÃO", "ENVIO INCERTO", "ENVIADA"])

export interface Kpis {
  analisadas: number
  selecionadas: number
  /** SELECIONADA and ABERTA: the actionable shortlist. */
  abertas: number
  emPreparacao: number
  prontasRevisao: number
  enviadas: number
  envioIncerto: number
}

export function computeKpis(views: JobView[]): Kpis {
  const selected = views.filter((view) => view.job.status_analise === "SELECIONADA")
  const status = (value: string) => views.filter((view) => view.job.status_candidatura === value).length
  return {
    analisadas: views.length,
    selecionadas: selected.length,
    abertas: selected.filter((view) => view.actionable).length,
    emPreparacao: status("EM PREPARAÇÃO"),
    prontasRevisao: status("PRONTA PARA REVISÃO"),
    enviadas: status("ENVIADA"),
    envioIncerto: views.filter((view) => view.uncertainSubmit).length,
  }
}

export interface FunnelStage {
  stage: "analisadas" | "selecionadas" | "abertas" | "em_preparacao" | "enviadas"
  count: number
}

/** Stage counts are computed independently (a sent job may since have closed). */
export function computeFunnel(views: JobView[]): FunnelStage[] {
  const kpis = computeKpis(views)
  return [
    { stage: "analisadas", count: kpis.analisadas },
    { stage: "selecionadas", count: kpis.selecionadas },
    { stage: "abertas", count: kpis.abertas },
    {
      stage: "em_preparacao",
      count: views.filter((view) => PREPARATION_OR_BEYOND.has(enumText(view.job.status_candidatura) ?? "")).length,
    },
    { stage: "enviadas", count: kpis.enviadas },
  ]
}

export type DistributionKey =
  | "status_analise"
  | "status_disponibilidade"
  | "status_candidatura"
  | "familia_funcao"
  | "setor"
  | "interesse"
  | "proximidade_eq"
  | "tipo_programa"
  | "fonte_descoberta"
  | "portal_candidatura"
  | "zona"
  | "uf"
  | "modalidade"

/** Bucket of one job on an axis; shared by the overview distributions and the list filters. */
export function bucketOf(view: JobView, key: DistributionKey): string {
  if (key === "zona" || key === "uf" || key === "modalidade") return view[key] || EMPTY_BUCKET
  if (key === "fonte_descoberta" || key === "portal_candidatura") return view.job[key] || EMPTY_BUCKET
  const cell = view.job[key] as EnumCell<string>
  if (isInvalid(cell)) return INVALID_BUCKET
  return cell ?? EMPTY_BUCKET
}

/** Applications dated (data_candidatura) in the ISO week (Monday, UTC) that contains `today`. */
export function sentInWeek(views: JobView[], today: string): number {
  const week = weekStart(today)
  return views.filter((view) => {
    const date = view.job.data_candidatura
    return date !== null && weekStart(date) === week && date.slice(0, 10) <= today
  }).length
}

export interface Bucket {
  value: string
  count: number
}

/** Counts per value, largest first; ties by value for a stable order. */
export function distribution(views: JobView[], key: DistributionKey): Bucket[] {
  const counts = new Map<string, number>()
  for (const view of views) {
    const value = bucketOf(view, key)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Monday (UTC) of the ISO week containing `date` (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  const offset = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - offset)
  return day.toISOString().slice(0, 10)
}

export interface WeekPoint {
  week: string
  count: number
}

/** Weekly counts with empty weeks filled between the first and last date. */
export function weeklySeries(dates: (string | null)[]): WeekPoint[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue
    const week = weekStart(date)
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }
  if (counts.size === 0) return []
  const weeks = [...counts.keys()].sort()
  const out: WeekPoint[] = []
  const cursor = new Date(`${weeks[0]}T00:00:00Z`)
  const last = weeks[weeks.length - 1]
  while (cursor.toISOString().slice(0, 10) <= last) {
    const week = cursor.toISOString().slice(0, 10)
    out.push({ week, count: counts.get(week) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return out
}

export function analysesPerWeek(views: JobView[]): WeekPoint[] {
  return weeklySeries(views.map((view) => view.job.data_primeira_analise))
}

export function applicationsPerWeek(views: JobView[]): WeekPoint[] {
  return weeklySeries(views.map((view) => view.job.data_candidatura))
}

export function eventsPerWeek(views: JobView[]): WeekPoint[] {
  return weeklySeries(views.flatMap((view) => view.events.map((event) => event.timestamp.slice(0, 10))))
}

export type CoverageCounts = Record<ResultadoCobertura | typeof INVALID_BUCKET, number>

function emptyCoverageCounts(): CoverageCounts {
  return Object.fromEntries([...RESULTADO_COBERTURA, INVALID_BUCKET].map((key) => [key, 0])) as CoverageCounts
}

function coverageKey(row: CoverageRow): keyof CoverageCounts {
  return row.resultado === null || isInvalid(row.resultado) ? INVALID_BUCKET : row.resultado
}

export interface SourceCoverage {
  fonte: string
  runs: number
  lastRun: string | null
  counts: CoverageCounts
}

export function coverageBySource(rows: CoverageRow[], period: Period = {}): SourceCoverage[] {
  const bySource = new Map<string, SourceCoverage>()
  for (const row of rows) {
    if (!inPeriod(row.data_execucao, period)) continue
    const fonte = row.fonte || EMPTY_BUCKET
    const entry = bySource.get(fonte) ?? { fonte, runs: 0, lastRun: null, counts: emptyCoverageCounts() }
    entry.runs += 1
    entry.counts[coverageKey(row)] += 1
    if (row.data_execucao && (!entry.lastRun || row.data_execucao > entry.lastRun)) entry.lastRun = row.data_execucao
    bySource.set(fonte, entry)
  }
  return [...bySource.values()].sort((a, b) => b.runs - a.runs || a.fonte.localeCompare(b.fonte))
}

export interface CoverageWeek {
  week: string
  counts: CoverageCounts
}

export function coverageByWeek(rows: CoverageRow[], period: Period = {}): CoverageWeek[] {
  const filtered = rows.filter((row) => inPeriod(row.data_execucao, period))
  return weeklySeries(filtered.map((row) => row.data_execucao)).map(({ week }) => {
    const counts = emptyCoverageCounts()
    for (const row of filtered) {
      if (row.data_execucao && weekStart(row.data_execucao) === week) counts[coverageKey(row)] += 1
    }
    return { week, counts }
  })
}

export interface QualitySummary {
  /** Jobs affected per issue code. */
  byCode: Partial<Record<IssueCode, number>>
  jobsWithIssues: number
  snapshotIssues: number
  analysis: Record<JobView["analysis"], number>
}

export function qualitySummary(data: Pick<JobSearchData, "views" | "issues">): QualitySummary {
  const byCode: Partial<Record<IssueCode, number>> = {}
  const analysis = { FULL: 0, PARTIAL: 0, NONE: 0, INVALID: 0 }
  for (const view of data.views) {
    analysis[view.analysis] += 1
    for (const code of new Set(view.issues.map((issue) => issue.code))) byCode[code] = (byCode[code] ?? 0) + 1
  }
  return {
    byCode,
    jobsWithIssues: data.views.filter((view) => view.issues.length > 0).length,
    snapshotIssues: data.issues.length,
    analysis,
  }
}
