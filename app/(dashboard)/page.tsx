import Link from "next/link"
import { AlertOctagon, AlertTriangle, ArrowRight, Info } from "lucide-react"
import { getJobSearchData } from "@/lib/job-search/source"
import { sentInWeek } from "@/lib/job-search/metrics"
import {
  attentionGroups,
  jobState,
  listHref,
  toListItem,
  todayQueue,
  type AttentionGroup,
  type JobListItem,
} from "@/lib/job-search/present"
import { DataSourceLine } from "@/components/job-search/page-header"
import { SyncButton } from "@/components/job-search/sync-button"
import { GoalRing } from "@/components/job-search/goal-ring"
import { SearchOps } from "@/components/job-search/ops"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"
import { UncertainSubmitAlert } from "@/components/job-search/overview"
import { DeclineJobButton } from "@/components/job-search/decline-job"
import { JobCard, NextMoveCard, ShelfTitle, StateLegend } from "@/components/job-search/visual"
import { canDeclineJob } from "@/lib/ops/present"
import { cn } from "@/lib/utils"

// "Hoje": the action queue. Charts and data quality live in /analise.

const TIME_ZONE = "America/Sao_Paulo"

const CHIP_STYLE: Record<string, { className: string; icon: typeof Info }> = {
  critical: { className: "bg-st-uncertain/15 text-st-uncertain-fg border-st-uncertain/40", icon: AlertOctagon },
  warning: { className: "bg-st-review/15 text-st-review-fg border-st-review/45", icon: AlertTriangle },
  info: { className: "bg-st-info/15 text-st-info-fg border-st-info/40", icon: Info },
}

function AttentionChip({ group }: { group: AttentionGroup }) {
  const style = CHIP_STYLE[group.tone] ?? CHIP_STYLE.info
  const Icon = style.icon
  return (
    <Link
      prefetch={false}
      href={group.href}
      title={group.description}
      data-testid={`attention-${group.id}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-transform hover:-translate-y-0.5",
        style.className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="tabular-nums">{group.jobs.length}</span> {group.title.toLowerCase()}
    </Link>
  )
}

/** "Descartar vaga" where the user chooses what to apply for; only with bot dispatch enabled. */
function declineAction(item: JobListItem, enabled: boolean): React.ReactNode {
  if (!enabled || !canDeclineJob(item)) return undefined
  const label = [item.empresa || "(sem empresa)", item.cargo || "(sem cargo)"].join(" · ")
  return <DeclineJobButton jobId={item.jobId} label={label} />
}

function CardGrid({
  items,
  testId,
  withDecline = false,
}: {
  items: JobListItem[]
  testId: string
  withDecline?: boolean
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid={testId}>
      {items.map((item, index) => (
        <JobCard key={item.jobId} item={item} index={index} action={declineAction(item, withDecline)} />
      ))}
    </ul>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export default async function HojePage() {
  const data = await getJobSearchData()
  const items = data.views.map(toListItem)
  const queue = todayQueue(items)
  const [next, ...rest] = queue

  const now = new Date()
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now)
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(now)
  const sentThisWeek = sentInWeek(data.views, today)

  const attention = attentionGroups(data.views)
  const uncertain = attention.find((group) => group.id === "envio-incerto")
  const chips = attention.filter((group) => group.id !== "envio-incerto")

  const hot = queue.filter((item) => !item.interesse.invalid && item.interesse.value === "MUITO_ALTO").length
  const review = queue.filter((item) => jobState(item) === "revisao").length
  const radar = items.filter(
    (item) =>
      !item.archived &&
      !item.statusAnalise.invalid &&
      item.statusAnalise.value === "SELECIONADA" &&
      jobState(item) === "nao-confirmada"
  )
  const sent = items
    .filter((item) => jobState(item) === "enviada")
    .sort((a, b) => (b.dataCandidatura ?? "").localeCompare(a.dataCandidatura ?? ""))
  const declined = items.filter((item) => jobState(item) === "descartada")
  const dispatch = isDispatchEnabled()

  const subline = [
    hot > 0 && `${hot} com interesse muito alto`,
    review > 0 && plural(review, "pronta pra revisar", "prontas pra revisar"),
  ].filter(Boolean)
  const heroNote =
    queue.length > 0
      ? subline.length > 0
        ? `${subline.join(", ")}.`
        : null
      : data.views.length === 0
        ? "Assim que o job-search registrar vagas, elas aparecem aqui."
        : "Tudo que estava aberto e selecionado já saiu da fila. Hora de cotar mais vagas."

  return (
    <div className="space-y-8">
      <section
        data-testid="today-hero"
        className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-st-open/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-3">
            <p className="text-sm font-medium text-muted-foreground first-letter:uppercase">{dateLabel}</p>
            <h1 className="font-display text-4xl leading-[1.05] font-bold tracking-tight text-foreground sm:text-5xl">
              {queue.length > 0 ? (
                <>
                  <span className="text-st-open-fg">{queue.length}</span>{" "}
                  {queue.length === 1 ? "vaga aberta esperando você" : "vagas abertas esperando você"}
                </>
              ) : data.views.length === 0 ? (
                "Registro vazio por enquanto"
              ) : (
                "Fila zerada. Nenhuma vaga aberta esperando você"
              )}
            </h1>
            {heroNote && <p className="max-w-2xl text-muted-foreground">{heroNote}</p>}
            <DataSourceLine data={data} />
          </div>
          <GoalRing sent={sentThisWeek} />
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          {chips.map((group) => (
            <AttentionChip key={group.id} group={group} />
          ))}
          <div className="ml-auto">
            <SyncButton />
          </div>
        </div>
        {isDispatchEnabled() && (
          <div className="relative mt-6 border-t border-border/70 pt-5">
            <SearchOps knownJobIds={data.views.map((view) => view.job.job_id)} />
          </div>
        )}
      </section>

      {uncertain && <UncertainSubmitAlert group={uncertain} />}

      {next && (
        <section aria-labelledby="proxima-candidatura">
          <ShelfTitle id="proxima-candidatura">Próxima candidatura</ShelfTitle>
          <NextMoveCard item={next} action={declineAction(next, dispatch)} />
        </section>
      )}

      {rest.length > 0 && (
        <section aria-labelledby="na-fila">
          <ShelfTitle
            id="na-fila"
            aside={
              <Link
                prefetch={false}
                href={listHref({ status_analise: "SELECIONADA", status_disponibilidade: "ABERTA" })}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                todas as abertas <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          >
            Na fila · {rest.length}
          </ShelfTitle>
          <CardGrid items={rest} testId="queue-list" withDecline={dispatch} />
        </section>
      )}

      {radar.length > 0 && (
        <section aria-labelledby="no-radar">
          <ShelfTitle id="no-radar" tone="muted">
            No radar · disponibilidade a confirmar
          </ShelfTitle>
          <CardGrid items={radar} testId="radar-list" />
        </section>
      )}

      <section aria-labelledby="enviadas">
        <ShelfTitle
          id="enviadas"
          tone="sent"
          aside={
            sent.length > 0 && (
              <Link
                prefetch={false}
                href={listHref({ status_candidatura: "ENVIADA" })}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                ver todas <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )
          }
        >
          Enviadas · {sent.length}
        </ShelfTitle>
        {sent.length > 0 ? (
          <CardGrid items={sent.slice(0, 6)} testId="sent-list" />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma candidatura enviada ainda. A primeira é a que mais pesa.
          </p>
        )}
      </section>

      {declined.length > 0 && (
        <section aria-labelledby="descartadas">
          <ShelfTitle id="descartadas" tone="muted">
            Descartadas por você · {declined.length}
          </ShelfTitle>
          <CardGrid items={declined} testId="declined-list" />
        </section>
      )}

      <footer className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <StateLegend />
        <Link
          prefetch={false}
          href="/analise"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Funil, distribuições e qualidade dos dados <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </footer>
    </div>
  )
}
