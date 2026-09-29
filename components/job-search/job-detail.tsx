import type React from "react"
import { AlertOctagon, CheckCircle2, Clock, ExternalLink, MinusCircle, PlusCircle, ShieldAlert } from "lucide-react"
import { EVIDENCE, labelFor, type Evidence } from "@/lib/job-search/enums"
import type { Dossier, Requirement } from "@/lib/job-search/dossier-schema"
import { enumText } from "@/lib/job-search/sheet-parse"
import { ANALYSIS_META, ISSUE_LABELS, formatTimestamp, safeHttpUrl, type Tone } from "@/lib/job-search/present"
import type { ApplicationEvent, JobView } from "@/lib/job-search/types"
import { ToneBadge, TONE_CLASSES } from "@/components/job-search/tone-badge"
import { SectionCard } from "@/components/job-search/overview"
import { cn } from "@/lib/utils"

// Everything textual here comes from the Sheet or the dossier (untrusted): plain text only.

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-muted-foreground">{children}</p>
}

export function ExternalAnchor({
  href,
  children,
  testId,
  primary = false,
}: {
  href: string | null
  children: React.ReactNode
  testId?: string
  /** The main call to action of the page (solid lime). */
  primary?: boolean
}) {
  const safe = safeHttpUrl(href)
  if (!safe) return null
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5",
        primary
          ? "bg-st-open text-st-open-ink"
          : "border border-border bg-card text-foreground hover:border-foreground/30"
      )}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

// ---------------------------------------------------------------------------

export function AnalysisBanner({ view }: { view: JobView }) {
  const meta = ANALYSIS_META[view.analysis]
  const record = view.dossier
  const Icon = view.analysis === "FULL" ? CheckCircle2 : view.analysis === "INVALID" ? AlertOctagon : MinusCircle
  const otherIssues = view.issues.filter(
    (issue) => issue.code !== "SHEET_DOSSIER_DIVERGENCE" && issue.code !== "DOSSIER_INVALID"
  )
  return (
    <section
      aria-label="Disponibilidade da análise"
      data-testid="analysis-banner"
      data-analysis={view.analysis}
      className={cn("rounded-xl border p-4", TONE_CLASSES[meta.tone])}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">{meta.label}</p>
          <p className="text-sm">{meta.description}</p>
          {record && (
            <p className="text-xs opacity-90">
              Dossier capturado em {formatTimestamp(record.captured_at)}
              {view.dossierRows > 1 && ` · ${view.dossierRows} versões na aba Dossiers (exibida a mais recente)`}
            </p>
          )}
          {view.analysis === "INVALID" && record && (
            <details className="text-xs">
              <summary className="cursor-pointer">Por que é inválido</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="dossier-errors">
                {record.errors.map((error) => (
                  <li key={error} className="break-words">
                    {error}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {view.divergences.length > 0 && (
            <div className="text-sm" data-testid="divergences">
              <p className="font-medium">Sheet e dossier divergem (sinalizado, não resolvido):</p>
              <table className="mt-1 w-full max-w-lg text-left text-xs">
                <thead>
                  <tr>
                    <th className="py-0.5 pr-2 font-medium">Campo</th>
                    <th className="py-0.5 pr-2 font-medium">Sheet</th>
                    <th className="py-0.5 font-medium">Dossier</th>
                  </tr>
                </thead>
                <tbody>
                  {view.divergences.map((divergence) => (
                    <tr key={divergence.field}>
                      <td className="py-0.5 pr-2 font-mono">{divergence.field}</td>
                      <td className="py-0.5 pr-2">{divergence.sheet ? labelFor(divergence.sheet) : "(vazio)"}</td>
                      <td className="py-0.5">{labelFor(divergence.dossier)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {otherIssues.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" data-testid="job-issues">
              {otherIssues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <ToneBadge
                    tone={issue.code === "UNCERTAIN_SUBMIT" ? "critical" : "warning"}
                    title={issue.message}
                    className="bg-background/70 whitespace-normal break-all text-left"
                  >
                    {ISSUE_LABELS[issue.code]}
                    {issue.code === "ENUM_INVALID" && issue.field ? `: ${issue.field} = "${issue.value ?? ""}"` : ""}
                  </ToneBadge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

const EVIDENCE_TONE: Record<Evidence, Tone> = {
  "ADERÊNCIA REAL": "good",
  "ADERÊNCIA TRANSFERÍVEL": "info",
  LACUNA: "warning",
  "NÃO CONFIRMADO": "muted",
}

const EVIDENCE_TITLES: Record<Evidence, string> = {
  "ADERÊNCIA REAL": "Aderência real",
  "ADERÊNCIA TRANSFERÍVEL": "Aderência transferível",
  LACUNA: "Lacunas",
  "NÃO CONFIRMADO": "Não confirmado",
}

export function RequirementsSection({ groups }: { groups: Record<Evidence, Requirement[]> }) {
  const total = EVIDENCE.reduce((sum, evidence) => sum + groups[evidence].length, 0)
  const shown = EVIDENCE.filter((evidence) => evidence !== "NÃO CONFIRMADO" || groups[evidence].length > 0)
  return (
    <SectionCard title="Requisitos" description="Classificados pelo job-search segundo a evidência do seu perfil.">
      {total === 0 ? (
        <Empty>A publicação não lista requisitos.</Empty>
      ) : (
        <div className={cn("grid gap-3 sm:grid-cols-2", shown.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
          {shown.map((evidence) => (
            <div key={evidence} className="rounded-lg border border-border p-3" data-testid={`req-${evidence}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <ToneBadge tone={EVIDENCE_TONE[evidence]}>{EVIDENCE_TITLES[evidence]}</ToneBadge>
                <span className="text-xs tabular-nums text-muted-foreground">{groups[evidence].length}</span>
              </div>
              {groups[evidence].length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum.</p>
              ) : (
                <ul className="space-y-1.5">
                  {groups[evidence].map((requirement, index) => (
                    <li key={index} className="text-sm">
                      <span className="text-foreground">{requirement.text || "(sem texto)"}</span>{" "}
                      <span
                        className={cn(
                          "text-xs",
                          requirement.tipo === "OBRIGATÓRIO" ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        · {requirement.tipo.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

export function ActivitiesSection({ activities }: { activities: Dossier["analysis"]["activities"] }) {
  return (
    <SectionCard title="Atividades" description="Centralidade na vaga e evidência no seu perfil.">
      <ul className="space-y-2">
        {activities.map((activity, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 text-foreground">{activity.text || "(sem texto)"}</span>
            <ToneBadge tone={activity.centralidade === "CENTRAL" ? "neutral" : "muted"}>
              {activity.centralidade === "CENTRAL" ? "Central" : "Periférica"}
            </ToneBadge>
            <ToneBadge tone={EVIDENCE_TONE[activity.evidencia]}>{EVIDENCE_TITLES[activity.evidencia]}</ToneBadge>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------

function extra(item: object, key: string): string | null {
  const value = (item as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() !== "" ? value : null
}

export function InterestSection({ dossier }: { dossier: Dossier }) {
  const interest = dossier.interest
  const exceptional = interest.oportunidade_excepcional?.evidence
  return (
    <SectionCard
      title="Interesse e motivos"
      description="Nível e fatores registrados pelo job-search; o painel só exibe, não recalcula."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone="neutral" className="text-sm" data-testid="interest-level">
            Interesse {labelFor(interest.level).toLowerCase()}
          </ToneBadge>
          <span className="text-xs text-muted-foreground">Modo de envio: {labelFor(interest.submit_mode)}</span>
        </div>

        <FactorList
          title="Amplificadores fortes"
          icon={<PlusCircle className="h-4 w-4 text-st-open-fg" aria-hidden="true" />}
          empty="Nenhum."
          items={interest.amplifiers.map((amp) => {
            const setor = extra(amp, "setor")
            return `${labelFor(amp.type)}${setor ? ` (${labelFor(setor)})` : ""}`
          })}
        />
        {exceptional && (
          <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
            “{exceptional}”
          </blockquote>
        )}
        <FactorList
          title="Fatores fracos"
          icon={<PlusCircle className="h-4 w-4 text-st-info-fg" aria-hidden="true" />}
          empty="Nenhum."
          items={interest.weak_positives.map((factor) => labelFor(factor))}
        />
        <FactorList
          title="Negativos"
          icon={<MinusCircle className="h-4 w-4 text-st-review-fg" aria-hidden="true" />}
          empty="Nenhum."
          items={interest.negatives.map((negative) => labelFor(negative.type))}
        />
        {interest.compensations.length > 0 && (
          <FactorList
            title="Compensações"
            empty=""
            items={interest.compensations.map(
              (item) => `${labelFor(item.negative)} compensado por ${labelFor(item.compensated_by)}`
            )}
          />
        )}
        {interest.negatives_observed && interest.negatives_observed.length > 0 && (
          <FactorList
            title="Negativos observados (sem efeito no nível)"
            empty=""
            items={interest.negatives_observed.map((item) => labelFor(item.type))}
          />
        )}
        {interest.unresolved_variable && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">Variável em aberto: {labelFor(interest.unresolved_variable)}</p>
            {interest.candidate_values && interest.candidate_values.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                Valores possíveis: {interest.candidate_values.map((value) => labelFor(value)).join(", ")}
              </p>
            )}
            {interest.resolution_attempts && interest.resolution_attempts.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {interest.resolution_attempts.map((attempt, index) => (
                  <li key={index}>{attempt}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function FactorList({
  title,
  icon,
  items,
  empty,
}: {
  title: string
  icon?: React.ReactNode
  items: string[]
  empty: string
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <li key={index} className="rounded-md border border-border bg-card px-2 py-0.5 text-sm text-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function RisksSection({ risks }: { risks: Dossier["representation_risks"] }) {
  return (
    <SectionCard title="Riscos e alertas" description="Riscos de representação registrados na análise.">
      {risks.length === 0 ? (
        <Empty>Nenhum risco registrado.</Empty>
      ) : (
        <ul className="space-y-3" data-testid="risks">
          {risks.map((risk, index) => (
            <li key={index} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{labelFor(risk.type)}</span>
                <ToneBadge tone={risk.status === "RESOLVED" ? "good" : "warning"}>{labelFor(risk.status)}</ToneBadge>
                {risk.consequential && <ToneBadge tone="warning">Consequencial</ToneBadge>}
                <span className="text-xs text-muted-foreground">Etapa: {labelFor(risk.stage)}</span>
              </div>
              {risk.detail && <p className="mt-1.5 text-sm text-foreground">{risk.detail}</p>}
              {risk.resolution && <p className="mt-1 text-sm text-muted-foreground">Resolução: {risk.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function yesNo(value: boolean | null | undefined): string {
  if (value === true) return "Sim"
  if (value === false) return "Não"
  return "Não confirmado"
}

export function LocationSection({ dossier }: { dossier: Dossier }) {
  const { location, jornada } = dossier
  const place = [location.municipio, location.uf].filter(Boolean).join("/")
  return (
    <SectionCard title="Localização e jornada">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="location">
        <Field label="Local">{place || "Não confirmado"}</Field>
        <Field label="Modalidade">{labelFor(location.modalidade)}</Field>
        <Field label="Zona">{labelFor(location.zona)}</Field>
        <Field label="Zona prioritária">{yesNo(location.prioritaria)}</Field>
        <Field label="Viável">{yesNo(location.viavel)}</Field>
        {location.distancia_km && (
          <Field label="Distância">
            {location.distancia_km.km} km de {location.distancia_km.anchor}
          </Field>
        )}
        {location.aceita_brasil !== undefined && location.aceita_brasil !== null && (
          <Field label="Aceita todo o Brasil">{yesNo(location.aceita_brasil)}</Field>
        )}
        <Field label="Jornada">
          {jornada.literal || "—"}
          <span className="block text-xs text-muted-foreground">{labelFor(jornada.classe)}</span>
        </Field>
      </dl>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------

const EVENT_TONE: Record<string, Tone> = {
  CLAIMED: "neutral",
  DRAFT_POSSIBLE: "neutral",
  DRAFT_CONFIRMED: "info",
  SUBMIT_INTENT: "warning",
  SUBMITTED: "good",
  SUBMIT_UNCERTAIN: "critical",
  CLOSED: "muted",
}

/** Events grouped by attempt, in time order (as `buildJobView` sorted them). */
export function EventsTimeline({ events, uncertain }: { events: ApplicationEvent[]; uncertain: boolean }) {
  if (events.length === 0) return <Empty>Nenhum evento de candidatura registrado.</Empty>
  const attempts = new Map<string, ApplicationEvent[]>()
  for (const event of events) {
    const key = event.attempt_id || "(sem tentativa)"
    attempts.set(key, [...(attempts.get(key) ?? []), event])
  }
  return (
    <div className="space-y-4" data-testid="events-timeline">
      {[...attempts.entries()].map(([attempt, items]) => (
        <div key={attempt}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Tentativa <span className="font-mono">{attempt}</span>
          </p>
          <ol className="relative space-y-3 border-l border-border pl-5">
            {items.map((event) => {
              const kind = enumText(event.evento) ?? ""
              const invalid = event.evento === null || typeof event.evento === "object"
              const tone: Tone = invalid ? "warning" : (EVENT_TONE[kind] ?? "neutral")
              const last = event === items[items.length - 1]
              return (
                <li key={event.row} className="relative" data-testid="event">
                  <span
                    className="absolute -left-[1.6rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card"
                    aria-hidden="true"
                  >
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneBadge tone={tone}>{invalid ? `Inválido: ${kind || "(vazio)"}` : labelFor(kind)}</ToneBadge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    {last && uncertain && kind === "SUBMIT_INTENT" && (
                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
                        sem resultado registrado
                      </span>
                    )}
                  </div>
                  {(event.submit_mode || event.evidencia || event.fingerprint8) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        event.submit_mode && `modo ${labelFor(enumText(event.submit_mode) ?? "")}`,
                        event.evidencia && `evidência ${event.evidencia}`,
                        event.fingerprint8 && `fingerprint ${event.fingerprint8}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}
