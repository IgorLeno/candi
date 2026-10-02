import Link from "next/link"
import { AlertOctagon, ArrowLeft } from "lucide-react"
import { labelFor } from "@/lib/job-search/enums"
import { isInvalid } from "@/lib/job-search/sheet-parse"
import { getJobSearchData } from "@/lib/job-search/source"
import { cellDisplay, formatDay, jobState, toListItem } from "@/lib/job-search/present"
import type { EnumCell, JobView } from "@/lib/job-search/types"
import { AnalysisBadge, CellBadge } from "@/components/job-search/cell-badge"
import { ToneBadge } from "@/components/job-search/tone-badge"
import { SectionCard } from "@/components/job-search/overview"
import { DoneStamp, Flames, JourneyTrail, StateBadge, stateBarClass } from "@/components/job-search/visual"
import { JobOps } from "@/components/job-search/ops"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"
import { canConfirmOpen, canDeclineJob, canDeleteJob, jobCvBlocker, jobDispatchBlocker } from "@/lib/ops/present"
import { ConfirmOpenButton } from "@/components/job-search/confirm-open"
import { DeclineJobButton } from "@/components/job-search/decline-job"
import { DeleteJobButton } from "@/components/job-search/delete-job"
import { cn } from "@/lib/utils"
import {
  ActivitiesSection,
  AnalysisBanner,
  Empty,
  EventsTimeline,
  ExternalAnchor,
  Field,
  InterestSection,
  LocationSection,
  RequirementsSection,
  RisksSection,
} from "@/components/job-search/job-detail"

function BackLink() {
  return (
    <Link
      prefetch={false}
      href="/vagas"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      data-testid="back-to-list"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para vagas
    </Link>
  )
}

export default async function VagaPage({ params }: { params: Promise<{ job_id: string }> }) {
  const { job_id: rawId } = await params
  const jobId = safeDecode(rawId)
  const data = await getJobSearchData()
  const view = data.views.find((item) => item.job.job_id === jobId)

  if (!view) {
    return (
      <>
        <BackLink />
        <div
          className="rounded-2xl border border-dashed border-border bg-card py-12 text-center"
          data-testid="job-not-found"
        >
          <p className="font-medium text-foreground">Vaga não encontrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhuma linha do registro tem o job_id <span className="font-mono">{jobId}</span>.
          </p>
        </div>
      </>
    )
  }
  return <JobDetail view={view} />
}

function JobDetail({ view }: { view: JobView }) {
  const { job } = view
  const dossier = view.dossier?.dossier ?? null
  const postingUrl = dossier?.identity.url ?? job.url
  const applicationUrl = dossier?.identity.application_url ?? null
  const item = toListItem(view)
  const state = jobState(item)
  const closed = state === "encerrada" || state === "retirada" || state === "fora"

  return (
    <article className="space-y-6" data-testid="job-detail">
      <div>
        <BackLink />
        <header
          className={cn(
            "relative overflow-hidden rounded-3xl border border-border bg-card p-6 pl-7 sm:p-8 sm:pl-9",
            closed && "border-dashed"
          )}
          data-state={state}
        >
          <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-2", stateBarClass(state))} />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <StateBadge state={state} className="px-3 py-1 text-sm" />
                <Flames cell={cellDisplay(job.interesse)} size="lg" />
              </div>
              <div>
                <h1
                  className={cn(
                    "font-display text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl",
                    closed && "text-st-closed-fg"
                  )}
                  data-testid="job-empresa"
                >
                  {job.empresa || "(sem empresa)"}
                </h1>
                <p className="mt-1 text-lg text-muted-foreground">{job.cargo || "(sem cargo)"}</p>
              </div>
              <div className="max-w-md">
                <JourneyTrail cell={cellDisplay(job.status_candidatura)} state={state} withLabels />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
              <ExternalAnchor href={applicationUrl ?? postingUrl} testId="link-principal" primary>
                {applicationUrl ? "Ir para a candidatura" : "Abrir publicação"}
              </ExternalAnchor>
              {applicationUrl && (
                <ExternalAnchor href={postingUrl} testId="link-vaga">
                  Publicação
                </ExternalAnchor>
              )}
              {state === "enviada" && <DoneStamp className="self-center text-base lg:mt-2" />}
              {state === "descartada" && <DoneStamp declined className="self-center text-base lg:mt-2" />}
              {isDispatchEnabled() && canDeclineJob(item) && (
                <DeclineJobButton
                  jobId={job.job_id}
                  label={[job.empresa || "(sem empresa)", job.cargo || "(sem cargo)"].join(" · ")}
                />
              )}
              {isDispatchEnabled() && canDeleteJob(item) && (
                <DeleteJobButton
                  jobId={job.job_id}
                  label={[job.empresa || "(sem empresa)", job.cargo || "(sem cargo)"].join(" · ")}
                />
              )}
            </div>
          </div>
          <div
            className="mt-6 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-4"
            data-testid="job-badges"
          >
            <CellBadge cell={cellDisplay(job.interesse)} testId="badge-interesse" />
            <CellBadge cell={cellDisplay(job.status_analise)} testId="badge-status-analise" />
            <CellBadge cell={cellDisplay(job.status_disponibilidade)} testId="badge-disponibilidade" />
            {isDispatchEnabled() && canConfirmOpen(item) && (
              <ConfirmOpenButton
                jobId={job.job_id}
                label={[job.empresa || "(sem empresa)", job.cargo || "(sem cargo)"].join(" · ")}
                postingUrl={postingUrl || null}
              />
            )}
            <CellBadge cell={cellDisplay(job.status_candidatura)} testId="badge-candidatura" />
            <AnalysisBadge level={view.analysis} testId="badge-analysis" />
            {job.archived && <ToneBadge tone="muted">Aba Encerradas</ToneBadge>}
            <span className="ml-auto text-xs text-muted-foreground">
              job_id <span className="font-mono">{job.job_id}</span>
            </span>
          </div>
          {isDispatchEnabled() && (
            <div className="mt-4">
              <JobOps
                jobId={job.job_id}
                cvBlocker={jobCvBlocker(item)}
                blocker={jobDispatchBlocker(item)}
                analyzed={view.dossier?.valid === true}
              />
            </div>
          )}
        </header>
      </div>

      {view.uncertainSubmit && (
        <div
          role="alert"
          data-testid="job-alert-envio-incerto"
          className="flex items-start gap-3 rounded-2xl border-2 border-st-uncertain/60 bg-st-uncertain/10 p-4 text-st-uncertain-fg"
        >
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">ENVIO INCERTO</p>
            <p className="text-sm">
              Houve intenção de envio sem resultado confirmado. Nova tentativa fica bloqueada até a reconciliação no
              job-search.
            </p>
          </div>
        </div>
      )}

      <AnalysisBanner view={view} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Resumo">
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Frase-núcleo">
                  {dossier ? dossier.analysis.core_sentence : <Empty>Indisponível sem dossier válido.</Empty>}
                </Field>
              </div>
              {dossier && <Field label="Senioridade">{dossier.analysis.seniority}</Field>}
              <Field label="Status da análise">{enumLabel(job.status_analise)}</Field>
              <Field label="Gate decisivo">{job.gate_decisivo || dossier?.analysis.gate_decisivo || "—"}</Field>
              <Field label="Motivo da análise">
                <span className="whitespace-pre-wrap">{job.motivo_analise || "—"}</span>
              </Field>
              <Field label="Família funcional">{enumLabel(job.familia_funcao)}</Field>
              <Field label="Setor">{enumLabel(job.setor)}</Field>
              <Field label="Proximidade com EQ">{enumLabel(job.proximidade_eq)}</Field>
              <Field label="Tipo de programa">{enumLabel(job.tipo_programa)}</Field>
              <Field label="Primeira / última análise">
                {formatDay(job.data_primeira_analise)} · {formatDay(job.data_ultima_analise)}
              </Field>
              <Field label="Fonte">
                {job.fonte_descoberta || job.fonte || "—"}
                {job.origem_skill && (
                  <span className="block text-xs text-muted-foreground">via {job.origem_skill}</span>
                )}
              </Field>
            </dl>
          </SectionCard>

          {dossier ? (
            <>
              <ActivitiesSection activities={dossier.analysis.activities} />
              {view.requirementsByEvidence && <RequirementsSection groups={view.requirementsByEvidence} />}
              <RisksSection risks={dossier.representation_risks} />
            </>
          ) : (
            <SectionCard title="Análise estruturada">
              <Empty>
                {view.analysis === "INVALID"
                  ? "O dossier desta vaga não passou na verificação; atividades, requisitos e riscos ficam ocultos até uma nova exportação válida."
                  : "Esta vaga não tem dossier. Atividades, requisitos, riscos e localização aparecem quando o job-search exportar a análise."}
              </Empty>
            </SectionCard>
          )}
        </div>

        <div className="space-y-6">
          {dossier ? (
            <InterestSection dossier={dossier} />
          ) : (
            <SectionCard title="Interesse">
              <div className="space-y-2">
                <CellBadge cell={cellDisplay(job.interesse)} />
                <Empty>Motivos do nível só constam no dossier.</Empty>
              </div>
            </SectionCard>
          )}
          {dossier && <LocationSection dossier={dossier} />}
          <SectionCard title="Candidatura">
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Status">
                <CellBadge cell={cellDisplay(job.status_candidatura)} />
              </Field>
              <Field label="Data">{formatDay(job.data_candidatura)}</Field>
              <Field label="Portal">{job.portal_candidatura || "—"}</Field>
              <Field label="Modelo">
                {enumLabel(job.application_model)}
                {dossier && (
                  <span className="block text-xs text-muted-foreground">
                    dica do dossier: {labelFor(dossier.application.model_hint)} (
                    {labelFor(dossier.application.hint_source)})
                  </span>
                )}
              </Field>
            </dl>
            <EventsTimeline events={view.events} uncertain={view.uncertainSubmit} />
          </SectionCard>
        </div>
      </div>

      {job.observacoes && (
        <SectionCard title="Observações da Sheet">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{job.observacoes}</p>
        </SectionCard>
      )}

      {dossier && view.dossier && (
        <SectionCard title="Publicação original" testId="posting">
          {view.dossier.posting_truncated && (
            <p className="mb-2 text-xs text-st-review-fg">
              Texto truncado na Sheet (limite de célula); o dossier foi analisado sobre a publicação completa.
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Mostrar texto da publicação
            </summary>
            {/* Plain text on purpose: the posting is untrusted and never rendered as HTML/markdown. */}
            <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 font-sans text-sm text-foreground">
              {view.dossier.posting_md}
            </pre>
          </details>
        </SectionCard>
      )}
    </article>
  )
}

/** Tolerates both already-decoded params and stray `%` in hand-typed URLs. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Label of a Sheet enum cell; an out-of-domain value keeps its raw text, flagged. */
function enumLabel(cell: EnumCell<string>): string {
  if (cell === null) return "—"
  return isInvalid(cell) ? `${cell.invalid} (valor inválido)` : labelFor(cell)
}
