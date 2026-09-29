import type React from "react"
import Link from "next/link"
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, MinusCircle } from "lucide-react"
import { RESULTADO_COBERTURA } from "@/lib/job-search/enums"
import {
  INVALID_BUCKET,
  type Bucket,
  type CoverageCounts,
  type FunnelStage,
  type Kpis,
  type QualitySummary,
  type SourceCoverage,
} from "@/lib/job-search/metrics"
import {
  ANALYSIS_META,
  ISSUE_LABELS,
  bucketLabel,
  formatDay,
  jobHref,
  listHref,
  type AttentionGroup,
  type FacetKey,
  type Tone,
} from "@/lib/job-search/present"
import type { AnalysisLevel, CoverageRow, IssueCode, SnapshotIssue } from "@/lib/job-search/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TONE_CLASSES, ToneBadge } from "@/components/job-search/tone-badge"
import { cn } from "@/lib/utils"

export function SectionCard({
  title,
  description,
  children,
  className,
  testId,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  testId?: string
}) {
  return (
    <Card
      className={cn("min-w-0 gap-4 rounded-2xl border-border bg-card py-5 shadow-none", className)}
      data-testid={testId}
    >
      <CardHeader className="px-5">
        <CardTitle className="font-display text-lg font-semibold">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  )
}

// Data links use prefetch={false}: the overview has dozens of them, and every prefetch is a
// full dynamic render.

const KPI_TILES: { key: keyof Kpis; label: string; hint: string; href: string }[] = [
  { key: "analisadas", label: "Analisadas", hint: "vagas no registro", href: "/vagas" },
  {
    key: "selecionadas",
    label: "Selecionadas",
    hint: "status da análise",
    href: listHref({ status_analise: "SELECIONADA" }),
  },
  {
    key: "abertas",
    label: "Abertas acionáveis",
    hint: "selecionadas e abertas",
    href: listHref({ status_analise: "SELECIONADA", status_disponibilidade: "ABERTA" }),
  },
  {
    key: "emPreparacao",
    label: "Em preparação",
    hint: "candidatura",
    href: listHref({ status_candidatura: "EM PREPARAÇÃO" }),
  },
  {
    key: "prontasRevisao",
    label: "Prontas p/ revisão",
    hint: "aguardando você",
    href: listHref({ status_candidatura: "PRONTA PARA REVISÃO" }),
  },
  { key: "enviadas", label: "Enviadas", hint: "candidatura", href: listHref({ status_candidatura: "ENVIADA" }) },
]

export function KpiRow({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="kpi-row">
      {KPI_TILES.map((tile) => (
        <Link
          prefetch={false}
          key={tile.key}
          href={tile.href}
          data-testid={`kpi-${tile.key}`}
          className="block rounded-2xl border border-border bg-card p-4 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
          <p className="mt-1 font-display text-4xl font-bold text-foreground tabular-nums">{kpis[tile.key]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
        </Link>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function UncertainSubmitAlert({ group }: { group: AttentionGroup }) {
  return (
    <div
      role="alert"
      data-testid="alert-envio-incerto"
      className="rounded-2xl border-2 border-st-uncertain/60 bg-st-uncertain/10 p-4 text-st-uncertain-fg"
    >
      <div className="flex items-start gap-3">
        <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            ENVIO INCERTO em {group.jobs.length} {group.jobs.length === 1 ? "vaga" : "vagas"}
          </p>
          <p className="mt-0.5 text-sm">{group.description}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {group.jobs.map((job) => (
              <li key={job.jobId}>
                <Link
                  prefetch={false}
                  href={jobHref(job.jobId)}
                  className="inline-flex rounded-full border border-st-uncertain/50 bg-background/60 px-3 py-1 text-xs font-semibold hover:bg-background"
                >
                  {job.empresa} — {job.cargo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const TONE_ICON: Partial<Record<Tone, typeof AlertOctagon>> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
}

export function AttentionPanel({ groups }: { groups: AttentionGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-st-sent-fg" aria-hidden="true" />
        Nada pendente de atenção.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {groups.map((group) => {
        const Icon = TONE_ICON[group.tone] ?? Info
        return (
          <li
            key={group.id}
            data-testid={`attention-${group.id}`}
            className={cn("rounded-lg border p-3", TONE_CLASSES[group.tone])}
          >
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {group.title} <span className="font-normal">({group.jobs.length})</span>
                  </p>
                  <Link prefetch={false} href={group.href} className="text-xs underline underline-offset-2">
                    ver na lista
                  </Link>
                </div>
                <p className="mt-0.5 text-xs opacity-90">{group.description}</p>
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {group.jobs.slice(0, 4).map((job) => (
                    <li key={job.jobId} className="truncate">
                      <Link prefetch={false} href={jobHref(job.jobId)} className="hover:underline">
                        {job.empresa} — {job.cargo}
                      </Link>
                    </li>
                  ))}
                  {group.jobs.length > 4 && <li>+ {group.jobs.length - 4}</li>}
                </ul>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------

const FUNNEL_LABELS: Record<FunnelStage["stage"], string> = {
  analisadas: "Analisadas",
  selecionadas: "Selecionadas",
  abertas: "Abertas acionáveis",
  em_preparacao: "Em preparação ou além",
  enviadas: "Enviadas",
}

function pct(count: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((count / total) * 100)}%`
}

export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const top = stages[0]?.count ?? 0
  return (
    <ol className="space-y-2.5" data-testid="funnel">
      {stages.map((stage) => (
        <li
          key={stage.stage}
          className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]"
        >
          <span className="truncate text-muted-foreground">{FUNNEL_LABELS[stage.stage]}</span>
          <span className="h-5 rounded bg-muted/60" aria-hidden="true">
            <span
              className="block h-full rounded"
              style={{ width: top ? `${(stage.count / top) * 100}%` : 0, background: "var(--series-1)" }}
            />
          </span>
          <span className="w-16 text-right tabular-nums">
            <span className="font-semibold text-foreground">{stage.count}</span>{" "}
            <span className="text-xs text-muted-foreground">{pct(stage.count, top)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------

/**
 * One axis as horizontal bars (single hue: bar length is the only encoding). Rows link to the
 * list filtered on that value when the axis is a list facet.
 */
export function DistributionCard({
  title,
  buckets,
  total,
  facet,
  emptyLabel,
  testId,
}: {
  title: string
  buckets: Bucket[]
  total: number
  facet?: FacetKey
  emptyLabel?: string
  testId?: string
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count))
  return (
    <SectionCard title={title} testId={testId}>
      {buckets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados.</p>
      ) : (
        <ul className="space-y-1">
          {buckets.map((bucket) => {
            const invalid = bucket.value === INVALID_BUCKET
            const label =
              bucket.value === "(vazio)" && emptyLabel ? emptyLabel : invalid ? "Inválido" : bucketLabel(bucket.value)
            const content = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    {invalid && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-st-review-fg" aria-hidden="true" />}
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium text-foreground">{bucket.count}</span>{" "}
                    <span className="text-xs text-muted-foreground">{pct(bucket.count, total)}</span>
                  </span>
                </span>
                <span className="mt-1 block h-1.5 rounded-sm bg-muted/60" aria-hidden="true">
                  <span
                    className="block h-full rounded-sm"
                    style={{
                      width: `${(bucket.count / max) * 100}%`,
                      background: invalid ? "rgb(var(--st-review))" : "var(--series-1)",
                    }}
                  />
                </span>
              </>
            )
            const rowClass = "block rounded px-1.5 py-1 text-sm"
            return (
              <li key={bucket.value}>
                {facet ? (
                  <Link
                    prefetch={false}
                    href={listHref({ [facet]: bucket.value })}
                    className={cn(rowClass, "hover:bg-muted/60")}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------

const RESULT_META: Record<string, { tone: Tone; icon: typeof AlertOctagon; short: string }> = {
  OK: { tone: "good", icon: CheckCircle2, short: "OK" },
  "SEM RESULTADOS RELEVANTES": { tone: "neutral", icon: MinusCircle, short: "Sem resultados" },
  INDISPONÍVEL: { tone: "warning", icon: AlertTriangle, short: "Indisponível" },
  "LOGIN NECESSÁRIO": { tone: "warning", icon: AlertTriangle, short: "Login" },
  "CAPTCHA/BLOQUEIO": { tone: "warning", icon: AlertTriangle, short: "Captcha/bloqueio" },
  [INVALID_BUCKET]: { tone: "warning", icon: AlertTriangle, short: "Inválido" },
}

function resultKey(row: CoverageRow): string {
  return row.resultado === null || typeof row.resultado === "object" ? INVALID_BUCKET : row.resultado
}

/** Per source: run counts by outcome, then the latest runs in date order (icon + label, not color alone). */
export function CoverageTable({ sources, rows }: { sources: SourceCoverage[]; rows: CoverageRow[] }) {
  if (sources.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma execução registrada.</p>
  const columns = ([...RESULTADO_COBERTURA, INVALID_BUCKET] as (keyof CoverageCounts)[]).filter((key) =>
    sources.some((source) => source.counts[key] > 0)
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-left text-sm" data-testid="coverage-table">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-medium">Fonte</th>
            <th className="py-2 pr-3 font-medium">Execuções</th>
            {columns.map((key) => (
              <th key={key} className="py-2 pr-3 font-medium">
                {RESULT_META[key].short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const recent = rows
              .filter((row) => (row.fonte || "(vazio)") === source.fonte)
              .sort((a, b) => (a.data_execucao ?? "").localeCompare(b.data_execucao ?? "") || a.row - b.row)
              .slice(-6)
            return (
              <tr key={source.fonte} className="border-b border-border/60 align-top">
                <td className="min-w-[10rem] py-2 pr-3">
                  <span className="font-medium text-foreground">{bucketLabel(source.fonte)}</span>
                  <ul className="mt-1 flex flex-wrap gap-1" aria-label="Últimas execuções">
                    {recent.map((row) => {
                      const key = resultKey(row)
                      const meta = RESULT_META[key]
                      const Icon = meta.icon
                      const text =
                        key === INVALID_BUCKET
                          ? `Inválido: ${String(row.resultado && typeof row.resultado === "object" ? row.resultado.invalid : "")}`
                          : key
                      return (
                        <li
                          key={row.row}
                          title={`${formatDay(row.data_execucao)} — ${text}${row.observacoes ? ` — ${row.observacoes}` : ""}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
                            TONE_CLASSES[meta.tone]
                          )}
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {formatDay(row.data_execucao).slice(0, 5)}
                          <span className="sr-only">: {text}</span>
                        </li>
                      )
                    })}
                  </ul>
                </td>
                <td className="py-2 pr-3 tabular-nums">{source.runs}</td>
                {columns.map((key) => (
                  <td key={key} className="py-2 pr-3 tabular-nums">
                    {source.counts[key] || <span className="text-muted-foreground">0</span>}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        Última execução:{" "}
        {sources.map((source, index) => (
          <span key={source.fonte}>
            {index > 0 && " · "}
            {bucketLabel(source.fonte)} {formatDay(source.lastRun)}
          </span>
        ))}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

const ANALYSIS_ORDER: AnalysisLevel[] = ["FULL", "PARTIAL", "NONE", "INVALID"]

export function QualityPanel({
  summary,
  total,
  snapshotIssues,
}: {
  summary: QualitySummary
  total: number
  snapshotIssues: SnapshotIssue[]
}) {
  const codes = (Object.entries(summary.byCode) as [IssueCode, number][]).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-5" data-testid="quality-panel">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Disponibilidade da análise
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {ANALYSIS_ORDER.map((level) => (
            <li key={level}>
              <Link
                prefetch={false}
                href={listHref({ analysis: level })}
                data-testid={`analysis-count-${level}`}
                className="block rounded-xl border border-border p-3 hover:border-foreground/25"
              >
                <ToneBadge tone={ANALYSIS_META[level].tone}>{ANALYSIS_META[level].label}</ToneBadge>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{summary.analysis[level]}</p>
                <p className="text-xs text-muted-foreground">{pct(summary.analysis[level], total)} das vagas</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Problemas por vaga ({summary.jobsWithIssues} de {total} vagas)
          </p>
          {summary.jobsWithIssues > 0 && (
            <Link
              prefetch={false}
              href="/vagas?problemas=1"
              className="text-xs text-primary underline underline-offset-2"
            >
              ver vagas
            </Link>
          )}
        </div>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum problema encontrado.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {codes.map(([code, count]) => (
              <li
                key={code}
                data-testid={`issue-${code}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
              >
                <span>{ISSUE_LABELS[code]}</span>
                <span className="font-semibold tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {snapshotIssues.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Estrutura da Sheet ({snapshotIssues.length})
          </p>
          <ul className="space-y-1 text-sm" data-testid="snapshot-issues">
            {snapshotIssues.map((issue, index) => (
              <li key={index} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-st-review-fg" aria-hidden />
                <span className="break-words">{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
