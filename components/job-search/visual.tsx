import type React from "react"
import Link from "next/link"
import {
  AlertOctagon,
  ArrowRight,
  Eye,
  Flame,
  HelpCircle,
  Lock,
  MinusCircle,
  Send,
  Undo2,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { labelFor } from "@/lib/job-search/enums"
import {
  JOB_STATE_META,
  JOURNEY_STEPS,
  flameCount,
  formatDay,
  jobHref,
  jobState,
  journeyStep,
  type CellDisplay,
  type JobListItem,
  type JobState,
} from "@/lib/job-search/present"
import { AnalysisBadge, CellBadge } from "@/components/job-search/cell-badge"
import { cn } from "@/lib/utils"

// Visual language of the "Caça" redesign: the state color is the first thing read on every job,
// always paired with an icon and a label (never color alone).

interface StateStyle {
  icon: LucideIcon
  /** Solid pill. */
  pill: string
  /** Left accent bar of a card. */
  bar: string
  /** Extra card classes (closed states look switched off). */
  card?: string
  title?: string
}

const STATE_STYLES: Record<JobState, StateStyle> = {
  aberta: { icon: Zap, pill: "bg-st-open text-st-open-ink", bar: "bg-st-open" },
  revisao: { icon: Eye, pill: "bg-st-review text-st-review-ink", bar: "bg-st-review" },
  enviada: { icon: Send, pill: "bg-st-sent text-st-sent-ink", bar: "bg-st-sent" },
  incerto: { icon: AlertOctagon, pill: "bg-st-uncertain text-st-uncertain-ink", bar: "bg-st-uncertain" },
  "nao-confirmada": {
    icon: HelpCircle,
    pill: "border border-dashed border-st-closed-fg text-muted-foreground",
    bar: "bg-st-closed",
  },
  encerrada: {
    icon: Lock,
    pill: "bg-st-closed text-st-closed-ink",
    bar: "bg-st-closed",
    card: "border-dashed bg-card/40",
    title: "text-st-closed-fg line-through decoration-1",
  },
  // Same symbol as a sent application, in red: the user decided on it, so the card stays fully legible.
  descartada: { icon: Send, pill: "bg-destructive text-destructive-foreground", bar: "bg-destructive" },
  retirada: {
    icon: Undo2,
    pill: "bg-st-closed text-st-closed-ink",
    bar: "bg-st-closed",
    card: "border-dashed bg-card/40",
    title: "text-st-closed-fg line-through decoration-1",
  },
  fora: {
    icon: MinusCircle,
    pill: "bg-st-closed text-st-closed-ink",
    bar: "bg-st-closed",
    card: "border-dashed bg-card/40",
    title: "text-st-closed-fg",
  },
}

/** Accent-bar background of a state (cards, detail header, legend). */
export function stateBarClass(state: JobState): string {
  return STATE_STYLES[state].bar
}

export function StateBadge({ state, className }: { state: JobState; className?: string }) {
  const style = STATE_STYLES[state]
  const Icon = style.icon
  return (
    <span
      title={JOB_STATE_META[state].description}
      data-state={state}
      data-testid="state-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        style.pill,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {JOB_STATE_META[state].label}
    </span>
  )
}

/** Interest as up to three flames plus its label; values outside the ladder fall back to the badge. */
export function Flames({
  cell,
  testId,
  showLabel = true,
  size = "sm",
}: {
  cell: CellDisplay
  testId?: string
  showLabel?: boolean
  size?: "sm" | "lg"
}) {
  const count = flameCount(cell)
  if (count === null) return <CellBadge cell={cell} empty="Interesse vazio" testId={testId} />
  const label = labelFor(cell.value!).toLowerCase()
  const icon = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-flame"
      title={`Interesse ${label}`}
      data-testid={testId}
    >
      <span className="inline-flex" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Flame
            key={index}
            className={cn(icon, index < count ? "fill-flame/30 text-flame" : "text-flame-off")}
            strokeWidth={2.25}
          />
        ))}
      </span>
      <span className={cn(!showLabel && "sr-only")}>interesse {label}</span>
    </span>
  )
}

/** Application trail: three segments after "não iniciada"; hidden when the status is off the ladder. */
export function JourneyTrail({
  cell,
  state,
  withLabels = false,
  testId,
}: {
  cell: CellDisplay
  state: JobState
  withLabels?: boolean
  testId?: string
}) {
  const step = journeyStep(cell)
  if (step === null) return <CellBadge cell={cell} testId={testId} />
  const fill = state === "incerto" ? "bg-st-uncertain" : state === "enviada" ? "bg-st-sent" : "bg-st-open"
  const remaining = JOURNEY_STEPS.length - step
  const text =
    step === 0
      ? "candidatura não iniciada"
      : remaining === 0
        ? "candidatura enviada"
        : `${JOURNEY_STEPS[step - 1].toLowerCase()} · ${remaining === 1 ? "falta 1 passo" : `faltam ${remaining} passos`}`
  return (
    <div data-testid={testId} data-step={step} className="min-w-0">
      <div
        className="flex gap-1"
        role="img"
        aria-label={`Candidatura: ${step} de ${JOURNEY_STEPS.length} etapas (${labelFor(cell.value!)})`}
      >
        {JOURNEY_STEPS.map((name, index) => (
          <span key={name} className={cn("h-1.5 flex-1 rounded-full", index < step ? fill : "bg-muted")} title={name} />
        ))}
      </div>
      {withLabels ? (
        <ol className="mt-1.5 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground" aria-hidden="true">
          {JOURNEY_STEPS.map((name, index) => (
            <li key={name} className={cn(index < step && "text-foreground")}>
              {name}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{text}</p>
      )}
    </div>
  )
}

/** The "feito" stamp on sent applications; `declined` is the red "descartada" stamp of a discarded job. */
export function DoneStamp({ className, declined = false }: { className?: string; declined?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid={declined ? "declined-stamp" : "done-stamp"}
      className={cn(
        "animate-stamp-in pointer-events-none inline-block -rotate-12 rounded-md border-2 px-2 py-0.5",
        "font-display text-xs font-bold uppercase tracking-widest",
        declined ? "border-destructive text-destructive" : "border-st-sent-fg text-st-sent-fg",
        className
      )}
    >
      {declined ? "descartada" : "feito"}
    </span>
  )
}

function place(item: JobListItem): string {
  return [item.empresa || "(sem empresa)", item.local].filter(Boolean).join(" · ")
}

/**
 * One job as a card. The whole card is the link (stretched anchor); testids match the table rows so
 * both list views are tested the same way.
 */
export function JobCard({
  item,
  index = 0,
  action,
}: {
  item: JobListItem
  index?: number
  /** Control above the stretched link (e.g. "Descartar vaga"); it must set its own `relative z-10`. */
  action?: React.ReactNode
}) {
  const state = jobState(item)
  const style = STATE_STYLES[state]
  return (
    <li
      data-testid="job-row"
      data-job-id={item.jobId}
      data-state={state}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      className={cn(
        "animate-rise-in group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 pl-5",
        "transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/25",
        "focus-within:ring-2 focus-within:ring-ring",
        style.card
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", style.bar)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StateBadge state={state} />
        <Flames cell={item.interesse} testId="row-interesse" />
      </div>
      <div className="min-w-0">
        <Link
          prefetch={false}
          href={jobHref(item.jobId)}
          data-testid="job-link"
          className={cn(
            "font-display text-lg leading-snug font-semibold text-foreground focus:outline-none",
            "after:absolute after:inset-0 after:content-['']",
            style.title
          )}
        >
          {item.cargo || "(sem cargo)"}
        </Link>
        <p className="truncate text-sm text-muted-foreground">{place(item)}</p>
      </div>
      {item.coreSentence && <p className="line-clamp-2 text-sm text-foreground/80">{item.coreSentence}</p>}
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <JourneyTrail cell={item.statusCandidatura} state={state} testId="row-candidatura" />
        </div>
        {state === "enviada" && <DoneStamp />}
        {state === "descartada" && <DoneStamp declined />}
      </div>
      {action && <div className="flex justify-end">{action}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
        <AnalysisBadge level={item.analysis} testId="row-analysis" />
        <span className="tabular-nums">análise {formatDay(item.dataUltimaAnalise)}</span>
      </div>
    </li>
  )
}

/** The highlighted "next move": the top of the queue, with its call to action. */
export function NextMoveCard({ item, action }: { item: JobListItem; action?: React.ReactNode }) {
  const state = jobState(item)
  return (
    <article
      data-testid="next-move"
      data-job-id={item.jobId}
      className="animate-rise-in relative overflow-hidden rounded-3xl border-2 border-st-open bg-card p-5 sm:p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-st-open/10 blur-3xl"
      />
      <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={state} />
            <Flames cell={item.interesse} size="lg" />
          </div>
          <div>
            <h3 className="font-display text-2xl leading-tight font-bold text-foreground sm:text-3xl">
              {item.cargo || "(sem cargo)"}
            </h3>
            <p className="mt-1 text-muted-foreground">{place(item)}</p>
          </div>
          {item.coreSentence && <p className="max-w-2xl text-sm text-foreground/85">{item.coreSentence}</p>}
          <div className="max-w-md">
            <JourneyTrail cell={item.statusCandidatura} state={state} />
          </div>
        </div>
        <Link
          prefetch={false}
          href={jobHref(item.jobId)}
          data-testid="next-move-link"
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-2xl bg-st-open px-5 py-3 font-display text-base font-bold text-st-open-ink",
            "transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          )}
        >
          Abrir vaga
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
        {action && <div className="md:col-start-2 md:justify-self-end">{action}</div>}
      </div>
    </article>
  )
}

/** Section title of the "Hoje" view: small uppercase label in a state color plus an optional aside. */
export function ShelfTitle({
  children,
  tone = "open",
  aside,
  id,
}: {
  children: React.ReactNode
  tone?: "open" | "sent" | "muted"
  aside?: React.ReactNode
  id?: string
}) {
  const color = tone === "open" ? "text-st-open-fg" : tone === "sent" ? "text-st-sent-fg" : "text-muted-foreground"
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className={cn("text-xs font-bold tracking-[0.14em] uppercase", color)}>
        {children}
      </h2>
      {aside}
    </div>
  )
}

export const STATE_LEGEND: JobState[] = [
  "aberta",
  "revisao",
  "enviada",
  "descartada",
  "incerto",
  "nao-confirmada",
  "encerrada",
]

export function StateLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legenda de estados">
      {STATE_LEGEND.map((state) => (
        <li key={state} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", stateBarClass(state))} />
          {JOB_STATE_META[state].label}
        </li>
      ))}
    </ul>
  )
}
