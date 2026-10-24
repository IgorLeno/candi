import Link from "next/link"
import { AlertOctagon, AlertTriangle, ArrowRight, Info } from "lucide-react"
import { getJobSearchData } from "@/lib/job-search/source"
import { sentInWeek } from "@/lib/job-search/metrics"
import {
  attentionGroups,
  jobHref,
  jobState,
  listHref,
  toListItem,
  todayPickList,
  todayView,
  type AttentionGroup,
  type JobListItem,
} from "@/lib/job-search/present"
import { DataSourceLine } from "@/components/job-search/page-header"
import { SyncButton } from "@/components/job-search/sync-button"
import { GoalRing } from "@/components/job-search/goal-ring"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"
import { UncertainSubmitAlert } from "@/components/job-search/overview"
import { DeclineJobButton } from "@/components/job-search/decline-job"
import { JobCard, NextMoveCard, ShelfTitle, StateLegend } from "@/components/job-search/visual"
import { canDeclineJob, todayAutoText, todayListLine, todayOutReason } from "@/lib/ops/present"
import { readTodayList, readTodaySettings } from "@/lib/ops/today"
import { TodayListControls } from "@/components/job-search/ops"
import { UnpinTodayButton } from "@/components/job-search/today-pin"
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

/**
 * "Descartar vaga" where the user chooses what to apply for, and "Tirar da fila" on a job the user pinned; only with
 * bot dispatch enabled.
 */
function cardActions(item: JobListItem, enabled: boolean, pinned = false): React.ReactNode {
  if (!enabled) return undefined
  const unpin = pinned ? <UnpinTodayButton jobId={item.jobId} /> : null
  const decline = canDeclineJob(item) ? (
    <DeclineJobButton
      jobId={item.jobId}
      label={[item.empresa || "(sem empresa)", item.cargo || "(sem cargo)"].join(" · ")}
    />
  ) : null
  if (!unpin && !decline) return undefined
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {unpin}
      {decline}
    </div>
  )
}

function CardGrid({
  items,
  testId,
  withActions = false,
  pinned = [],
}: {
  items: JobListItem[]
  testId: string
  withActions?: boolean
  pinned?: string[]
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid={testId}>
      {items.map((item, index) => {
        const isPinned = pinned.includes(item.jobId)
        return (
          <JobCard
            key={item.jobId}
            item={item}
            index={index}
            pinned={isPinned}
            action={cardActions(item, withActions, isPinned)}
          />
        )
      })}
    </ul>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export default async function HojePage() {
  const data = await getJobSearchData()
  const items = data.views.map(toListItem)
  const dispatch = isDispatchEnabled()
  const [today, todaySettings] = dispatch
    ? await Promise.all([readTodayList(), readTodaySettings()])
    : [{ list: null, failed: false }, null]
  const { queue, out, pinned } = todayView(items, today.list)
  const [next, ...rest] = queue

  const now = new Date()
  const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now)
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(now)
  const sentThisWeek = sentInWeek(data.views, todayDate)

  const attention = attentionGroups(data.views)
  const uncertain = attention.find((group) => group.id === "envio-incerto")
  const chips = attention.filter((group) => group.id !== "envio-incerto")

  const hot = queue.filter((item) => !item.interesse.invalid && item.interesse.value === "MUITO_ALTO").length
  const review = queue.filter((item) => jobState(item) === "revisao").length
  // A pinned job the user put in the queue is not repeated on the radar.
  const queued = new Set(queue.map((item) => item.jobId))
  const radar = items.filter(
    (item) =>
      !queued.has(item.jobId) &&
      !item.archived &&
      !item.statusAnalise.invalid &&
      item.statusAnalise.value === "SELECIONADA" &&
      jobState(item) === "nao-confirmada"
  )
  const sent = items
    .filter((item) => jobState(item) === "enviada")
    .sort((a, b) => (b.dataCandidatura ?? "").localeCompare(a.dataCandidatura ?? ""))
  const declined = items.filter((item) => jobState(item) === "descartada")
  const baseLine = !dispatch
    ? null
    : today.list
      ? todayListLine(today.list, now)
      : today.failed
        ? "Não foi possível ler a lista do job-search: a Hoje mostra todas as selecionadas e abertas."
        : "Lista ainda não atualizada: a Hoje mostra todas as selecionadas e abertas."
  // Front B: the automatic refresh (on/off, next run or last skip) follows the list line.
  const listLine = baseLine && todaySettings ? `${baseLine} · ${todayAutoText(todaySettings, now)}` : baseLine

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
        {dispatch ? (
          <div className="relative mt-6">
            <TodayListControls
              picks={todayPickList(items)}
              queued={queue.map((item) => item.jobId)}
              leading={chips.map((group) => (
                <AttentionChip key={group.id} group={group} />
              ))}
              trailing={<SyncButton />}
            />
          </div>
        ) : (
          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            {chips.map((group) => (
              <AttentionChip key={group.id} group={group} />
            ))}
            <div className="ml-auto">
              <SyncButton />
            </div>
          </div>
        )}
        {listLine && (
          <p className="relative mt-3 text-xs text-muted-foreground" data-testid="today-list-updated">
            {listLine}
          </p>
        )}
      </section>

      {uncertain && <UncertainSubmitAlert group={uncertain} />}

      {next && (
        <section aria-labelledby="candidatura-atual">
          <ShelfTitle id="candidatura-atual">Candidatura atual</ShelfTitle>
          <NextMoveCard
            item={next}
            pinned={pinned.includes(next.jobId)}
            action={cardActions(next, dispatch, pinned.includes(next.jobId))}
          />
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
          <CardGrid items={rest} testId="queue-list" withActions={dispatch} pinned={pinned} />
        </section>
      )}

      {out.length > 0 && (
        <details className="group" data-testid="out-of-list">
          <summary className="cursor-pointer list-none">
            <ShelfTitle id="fora-da-lista" tone="muted">
              Fora da lista · {out.length}
            </ShelfTitle>
          </summary>
          <ul className="mt-3 space-y-2" data-testid="out-of-list-items">
            {out.map(({ item, motivo }) => (
              <li
                key={item.jobId}
                data-testid="out-of-list-job"
                data-job-id={item.jobId}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <Link prefetch={false} href={jobHref(item.jobId)} className="font-medium hover:underline">
                  {[item.empresa || "(sem empresa)", item.cargo || "(sem cargo)"].join(" · ")}
                </Link>
                <span className="text-xs text-muted-foreground" data-testid="out-of-list-reason">
                  {todayOutReason(motivo)}
                </span>
              </li>
            ))}
          </ul>
        </details>
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
