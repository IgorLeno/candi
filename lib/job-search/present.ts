import { INTEREST_LEVELS, LEGACY, MAIN_ENUM_DOMAINS, labelFor, type MainEnumField } from "@/lib/job-search/enums"
import { EMPTY_BUCKET, INVALID_BUCKET, bucketOf, type DistributionKey, type Period } from "@/lib/job-search/metrics"
import { enumText, isInvalid } from "@/lib/job-search/sheet-parse"
import type { AnalysisLevel, EnumCell, IssueCode, JobView } from "@/lib/job-search/types"

// Presentation helpers over `JobView`: labels, tones, list projection and filters.
// Nothing here decides a business outcome; every value comes from job-search data.

export type Tone = "good" | "warning" | "critical" | "info" | "neutral" | "muted"

/** Display text of a bucket value (enum token, INVÁLIDO, vazio or free text). */
export function bucketLabel(value: string): string {
  if (value === EMPTY_BUCKET) return "Vazio"
  if (value === INVALID_BUCKET) return "Inválido"
  return labelFor(value)
}

const STATUS_TONES: Record<string, Tone> = {
  // status_analise
  SELECIONADA: "good",
  "NÃO PRIORIZADA": "neutral",
  DESCARTADA: "muted",
  // status_disponibilidade
  ABERTA: "good",
  ENCERRADA: "muted",
  "NÃO CONFIRMADA": "neutral",
  // status_candidatura
  "NÃO INICIADA": "neutral",
  "EM PREPARAÇÃO": "info",
  "PRONTA PARA REVISÃO": "warning",
  ENVIADA: "good",
  "ENVIO INCERTO": "critical",
  RETIRADA: "muted",
}

/** Tone of an enum cell; an out-of-domain value is always a data-quality warning. */
export function cellTone(cell: EnumCell<string>): Tone {
  if (cell === null) return "muted"
  if (isInvalid(cell)) return "warning"
  return STATUS_TONES[cell] ?? "neutral"
}

export const ANALYSIS_META: Record<AnalysisLevel, { label: string; tone: Tone; description: string }> = {
  FULL: {
    label: "Dossier completo",
    tone: "good",
    description: "Dossier válido, íntegro (sha256 confere) e coerente com a Sheet.",
  },
  PARTIAL: {
    label: "Análise parcial",
    tone: "info",
    description:
      "Só as colunas da Sheet estão classificadas, ou o dossier é válido mas tem publicação truncada ou diverge da Sheet.",
  },
  NONE: {
    label: "Sem análise",
    tone: "muted",
    description: "Sem dossier e sem classificação na Sheet (ex.: vagas históricas NAO_CLASSIFICADO).",
  },
  INVALID: {
    label: "Dossier inválido",
    tone: "critical",
    description: "Há dossier, mas o hash, o JSON ou o schema dossier/1 não conferem. O conteúdo não é exibido.",
  },
}

export const ISSUE_LABELS: Record<IssueCode, string> = {
  ENUM_INVALID: "Valor fora do domínio",
  REQUIRED_EMPTY: "Campo obrigatório vazio",
  DATE_INVALID: "Data ilegível",
  DUPLICATE_JOB_ID: "job_id repetido",
  NOT_CLASSIFIED: "Não classificada (legado)",
  SELECTED_WITHOUT_DOSSIER: "Selecionada sem dossier",
  DOSSIER_INVALID: "Dossier inválido",
  DOSSIER_POSTING_TRUNCATED: "Publicação truncada",
  SHEET_DOSSIER_DIVERGENCE: "Divergência Sheet × dossier",
  UNCERTAIN_SUBMIT: "Envio incerto",
  EVENT_INVALID: "Evento fora do domínio",
}

/** Only http(s) links from the Sheet/dossier become anchors (no `javascript:` etc.). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function jobHref(jobId: string): string {
  return `/vaga/${encodeURIComponent(jobId)}`
}

// ---------------------------------------------------------------------------
// List projection and filters

export const FACET_KEYS = [
  "status_analise",
  "status_candidatura",
  "status_disponibilidade",
  "interesse",
  "analysis",
  "familia_funcao",
  "setor",
  "tipo_programa",
  "proximidade_eq",
  "fonte_descoberta",
  "portal_candidatura",
  "zona",
  "modalidade",
] as const
export type FacetKey = (typeof FACET_KEYS)[number]

export const FACET_LABELS: Record<FacetKey, string> = {
  status_analise: "Status da análise",
  status_candidatura: "Candidatura",
  status_disponibilidade: "Disponibilidade",
  interesse: "Interesse",
  analysis: "Dossier",
  familia_funcao: "Família funcional",
  setor: "Setor",
  tipo_programa: "Tipo de programa",
  proximidade_eq: "Proximidade com EQ",
  fonte_descoberta: "Fonte",
  portal_candidatura: "Portal",
  zona: "Zona",
  modalidade: "Modalidade",
}

export interface CellDisplay {
  /** Raw value (invalid values keep their raw text); null when empty. */
  value: string | null
  invalid: boolean
  tone: Tone
}

export function cellDisplay(cell: EnumCell<string>): CellDisplay {
  return { value: enumText(cell), invalid: isInvalid(cell), tone: cellTone(cell) }
}

/** Serializable, slim row for the client list (no posting, no dossier body). */
export interface JobListItem {
  jobId: string
  empresa: string
  cargo: string
  coreSentence: string | null
  motivo: string
  local: string | null
  interesse: CellDisplay
  statusAnalise: CellDisplay
  statusDisponibilidade: CellDisplay
  statusCandidatura: CellDisplay
  analysis: AnalysisLevel
  archived: boolean
  uncertainSubmit: boolean
  /** RETIRADA by the user's own decision ("Descartar vaga"): last CLOSED event with USER_DECLINED. */
  userDeclined: boolean
  issueCodes: IssueCode[]
  dataPrimeiraAnalise: string | null
  dataUltimaAnalise: string | null
  dataCandidatura: string | null
  facets: Record<FacetKey, string>
}

function facetOf(view: JobView, key: FacetKey): string {
  return key === "analysis" ? view.analysis : bucketOf(view, key as DistributionKey)
}

/**
 * job-search writes RETIRADA for USER_DECLINED, JOB_CLOSED and NOT_ELIGIBLE alike; the CLOSED event's
 * `evidencia` (registry.md) tells the user's own "Descartar vaga" apart. Events are already sorted by time.
 */
export function isUserDeclined(view: Pick<JobView, "job" | "events">): boolean {
  if (enumText(view.job.status_candidatura) !== "RETIRADA") return false
  const closed = view.events.filter((event) => enumText(event.evento) === "CLOSED")
  return closed.at(-1)?.evidencia === "USER_DECLINED"
}

export function toListItem(view: JobView): JobListItem {
  const { job } = view
  const dossier = view.dossier?.dossier ?? null
  const municipio = dossier?.location.municipio ?? null
  const local = [municipio, view.uf].filter(Boolean).join("/") || null
  return {
    jobId: job.job_id,
    empresa: job.empresa,
    cargo: job.cargo,
    coreSentence: dossier?.analysis.core_sentence ?? null,
    motivo: job.motivo_analise,
    local,
    interesse: cellDisplay(job.interesse),
    statusAnalise: cellDisplay(job.status_analise),
    statusDisponibilidade: cellDisplay(job.status_disponibilidade),
    statusCandidatura: cellDisplay(job.status_candidatura),
    analysis: view.analysis,
    archived: job.archived,
    uncertainSubmit: view.uncertainSubmit,
    userDeclined: isUserDeclined(view),
    issueCodes: [...new Set(view.issues.map((issue) => issue.code))],
    dataPrimeiraAnalise: job.data_primeira_analise,
    dataUltimaAnalise: job.data_ultima_analise,
    dataCandidatura: job.data_candidatura,
    facets: Object.fromEntries(FACET_KEYS.map((key) => [key, facetOf(view, key)])) as Record<FacetKey, string>,
  }
}

export type SortKey = "interesse" | "recentes" | "empresa"
export type ArchiveFilter = "todas" | "ativas" | "encerradas"

export interface JobFilters {
  q: string
  facets: Partial<Record<FacetKey, string>>
  arquivo: ArchiveFilter
  envioIncerto: boolean
  comProblema: boolean
  sort: SortKey
}

export const DEFAULT_FILTERS: JobFilters = {
  q: "",
  facets: {},
  arquivo: "todas",
  envioIncerto: false,
  comProblema: false,
  sort: "interesse",
}

type Params = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

/** URL search params → filters; unknown values are ignored, never trusted as-is. */
export function parseFilters(params: Params): JobFilters {
  const facets: JobFilters["facets"] = {}
  for (const key of FACET_KEYS) {
    const value = first(params[key])
    if (value) facets[key] = value
  }
  const arquivo = first(params.arquivo)
  const sort = first(params.ordem)
  return {
    q: first(params.q).slice(0, 200),
    facets,
    arquivo: arquivo === "ativas" || arquivo === "encerradas" ? arquivo : "todas",
    envioIncerto: first(params.envio_incerto) === "1",
    comProblema: first(params.problemas) === "1",
    sort: sort === "recentes" || sort === "empresa" ? sort : "interesse",
  }
}

export function filtersToParams(filters: JobFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set("q", filters.q)
  for (const key of FACET_KEYS) {
    const value = filters.facets[key]
    if (value) params.set(key, value)
  }
  if (filters.arquivo !== "todas") params.set("arquivo", filters.arquivo)
  if (filters.envioIncerto) params.set("envio_incerto", "1")
  if (filters.comProblema) params.set("problemas", "1")
  if (filters.sort !== "interesse") params.set("ordem", filters.sort)
  return params
}

/** Case- and accent-insensitive text for search. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

export function matchesFilters(item: JobListItem, filters: JobFilters): boolean {
  if (filters.arquivo === "ativas" && item.archived) return false
  if (filters.arquivo === "encerradas" && !item.archived) return false
  if (filters.envioIncerto && !item.uncertainSubmit) return false
  if (filters.comProblema && item.issueCodes.length === 0) return false
  for (const key of FACET_KEYS) {
    const wanted = filters.facets[key]
    if (wanted && item.facets[key] !== wanted) return false
  }
  const query = normalizeText(filters.q.trim())
  if (query) {
    const haystack = normalizeText([item.empresa, item.cargo, item.jobId, item.coreSentence ?? ""].join(" "))
    if (!haystack.includes(query)) return false
  }
  return true
}

// Highest interest first; INDEFINIDO, legacy and invalid values after the ladder.
const INTEREST_RANK = [...INTEREST_LEVELS].reverse()

function interestRank(item: JobListItem): number {
  const index = INTEREST_RANK.indexOf(item.interesse.value as (typeof INTEREST_RANK)[number])
  if (index >= 0 && !item.interesse.invalid) return index
  if (item.interesse.value === "INDEFINIDO") return INTEREST_RANK.length
  if (item.interesse.value === LEGACY) return INTEREST_RANK.length + 1
  return INTEREST_RANK.length + 2
}

function byRecent(a: JobListItem, b: JobListItem): number {
  return (b.dataUltimaAnalise ?? "").localeCompare(a.dataUltimaAnalise ?? "") || a.jobId.localeCompare(b.jobId)
}

export function sortJobs(items: JobListItem[], sort: SortKey): JobListItem[] {
  const out = [...items]
  if (sort === "recentes") return out.sort(byRecent)
  if (sort === "empresa") {
    return out.sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR") || a.jobId.localeCompare(b.jobId))
  }
  return out.sort((a, b) => interestRank(a) - interestRank(b) || byRecent(a, b))
}

/** Options for a facet: its contract domain (when it has one) plus any other value present in the data. */
export function facetOptions(items: JobListItem[], key: FacetKey): string[] {
  const domain: readonly string[] =
    key === "analysis"
      ? ["FULL", "PARTIAL", "NONE", "INVALID"]
      : key in MAIN_ENUM_DOMAINS
        ? MAIN_ENUM_DOMAINS[key as MainEnumField]
        : []
  const present = [...new Set(items.map((item) => item.facets[key]))].filter((value) => !domain.includes(value))
  present.sort((a, b) => a.localeCompare(b, "pt-BR"))
  return [...domain, ...present]
}

export function facetOptionLabel(key: FacetKey, value: string): string {
  if (key === "analysis" && value in ANALYSIS_META) return ANALYSIS_META[value as AnalysisLevel].label
  return bucketLabel(value)
}

/** Link to the list pre-filtered on one facet value (used by overview distributions). */
export function listHref(facets: Partial<Record<FacetKey, string>>, extra: Record<string, string> = {}): string {
  const params = filtersToParams({ ...DEFAULT_FILTERS, facets })
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  const query = params.toString()
  return query ? `/vagas?${query}` : "/vagas"
}

// ---------------------------------------------------------------------------
// Overview

export const PERIODS = [
  { id: "tudo", label: "Tudo" },
  { id: "90d", label: "90 dias" },
  { id: "30d", label: "30 dias" },
] as const
export type PeriodId = (typeof PERIODS)[number]["id"]

export function parsePeriod(raw: string | string[] | undefined): PeriodId {
  const value = first(raw)
  return PERIODS.some((period) => period.id === value) ? (value as PeriodId) : "tudo"
}

/** Inclusive window ending `today` (YYYY-MM-DD). */
export function periodRange(id: PeriodId, today: string): Period {
  if (id === "tudo") return {}
  const days = id === "30d" ? 30 : 90
  const from = new Date(`${today}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - (days - 1))
  return { from: from.toISOString().slice(0, 10), to: today }
}

export interface AttentionGroup {
  id: "envio-incerto" | "dossier-invalido" | "pronta-revisao" | "divergencia" | "sem-dossier" | "valor-invalido"
  title: string
  description: string
  tone: Tone
  href: string
  jobs: { jobId: string; empresa: string; cargo: string }[]
}

function jobRef(view: JobView) {
  return { jobId: view.job.job_id, empresa: view.job.empresa, cargo: view.job.cargo }
}

function hasIssue(view: JobView, code: IssueCode): boolean {
  return view.issues.some((issue) => issue.code === code)
}

/** Situations worth a look, most severe first; empty groups are dropped. */
export function attentionGroups(views: JobView[]): AttentionGroup[] {
  const groups: AttentionGroup[] = [
    {
      id: "envio-incerto",
      title: "Envio incerto",
      description: "Possível clique final sem confirmação. Bloqueia nova tentativa até reconciliação no job-search.",
      tone: "critical",
      href: "/vagas?envio_incerto=1",
      jobs: views.filter((view) => view.uncertainSubmit).map(jobRef),
    },
    {
      id: "dossier-invalido",
      title: "Dossier inválido",
      description: "Hash, JSON ou schema não conferem; a análise não é exibida até nova exportação.",
      tone: "critical",
      href: listHref({ analysis: "INVALID" }),
      jobs: views.filter((view) => view.analysis === "INVALID").map(jobRef),
    },
    {
      id: "pronta-revisao",
      title: "Prontas para revisão",
      description: "Candidaturas preparadas aguardando sua revisão.",
      tone: "warning",
      href: listHref({ status_candidatura: "PRONTA PARA REVISÃO" }),
      jobs: views.filter((view) => view.job.status_candidatura === "PRONTA PARA REVISÃO").map(jobRef),
    },
    {
      id: "divergencia",
      title: "Sheet × dossier divergentes",
      description: "Colunas da Sheet diferentes do dossier. Sinalizado, não resolvido aqui.",
      tone: "warning",
      href: "/vagas?problemas=1",
      jobs: views.filter((view) => view.divergences.length > 0).map(jobRef),
    },
    {
      id: "valor-invalido",
      title: "Valores fora do domínio",
      description: "Células com valor que não pertence ao contrato do job-search.",
      tone: "warning",
      href: "/vagas?problemas=1",
      jobs: views.filter((view) => hasIssue(view, "ENUM_INVALID") || hasIssue(view, "EVENT_INVALID")).map(jobRef),
    },
    {
      id: "sem-dossier",
      title: "Selecionadas sem dossier",
      description: "Vagas SELECIONADA sem análise estruturada na aba Dossiers.",
      tone: "info",
      href: listHref({ status_analise: "SELECIONADA" }, { problemas: "1" }),
      jobs: views.filter((view) => hasIssue(view, "SELECTED_WITHOUT_DOSSIER")).map(jobRef),
    },
  ]
  return groups.filter((group) => group.jobs.length > 0)
}

// ---------------------------------------------------------------------------
// Dates (UTC, so server and client render the same text)

/** YYYY-MM-DD → DD/MM/YYYY; anything else is returned as-is. */
export function formatDay(date: string | null | undefined): string {
  if (!date) return "—"
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date
}

/** ISO timestamp → DD/MM/YYYY HH:MM UTC; unparseable text is returned as-is. */
export function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return "—"
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(timestamp)
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]} UTC` : timestamp
}

// ---------------------------------------------------------------------------
// Visual state ("Hoje" view, cards). Presentation groupings over job-search values; they decide
// only color, order and wording, never a job-search outcome.

export type JobState =
  | "incerto"
  | "enviada"
  | "descartada"
  | "retirada"
  | "fora"
  | "encerrada"
  | "revisao"
  | "aberta"
  | "nao-confirmada"

export const JOB_STATE_META: Record<JobState, { label: string; description: string }> = {
  incerto: { label: "Envio incerto", description: "Possível envio sem confirmação; aguarda reconciliação." },
  enviada: { label: "Enviada", description: "Candidatura enviada." },
  descartada: { label: "Descartada", description: "Você descartou esta vaga: não vai se candidatar." },
  retirada: { label: "Retirada", description: "Candidatura retirada." },
  fora: { label: "Fora da fila", description: "Análise descartou ou não priorizou a vaga." },
  encerrada: { label: "Encerrada", description: "Vaga encerrada no portal ou arquivada." },
  revisao: { label: "Pronta pra revisar", description: "Candidatura preparada aguardando sua revisão." },
  aberta: { label: "Aberta", description: "Vaga aberta." },
  "nao-confirmada": { label: "Não confirmada", description: "Disponibilidade ainda não confirmada." },
}

type StateInput = Pick<
  JobListItem,
  "statusAnalise" | "statusDisponibilidade" | "statusCandidatura" | "archived" | "uncertainSubmit"
> &
  Partial<Pick<JobListItem, "userDeclined">>

/** One visual state per job, most decisive first (an invalid cell never matches a state value). */
export function jobState(item: StateInput): JobState {
  const candidatura = item.statusCandidatura.invalid ? null : item.statusCandidatura.value
  const analise = item.statusAnalise.invalid ? null : item.statusAnalise.value
  const disponibilidade = item.statusDisponibilidade.invalid ? null : item.statusDisponibilidade.value
  if (item.uncertainSubmit || candidatura === "ENVIO INCERTO") return "incerto"
  if (candidatura === "ENVIADA") return "enviada"
  if (candidatura === "RETIRADA") return item.userDeclined ? "descartada" : "retirada"
  if (analise === "DESCARTADA" || analise === "NÃO PRIORIZADA") return "fora"
  if (disponibilidade === "ENCERRADA" || item.archived) return "encerrada"
  if (candidatura === "PRONTA PARA REVISÃO") return "revisao"
  if (disponibilidade === "ABERTA") return "aberta"
  return "nao-confirmada"
}

/** Steps of the application trail after "NÃO INICIADA". */
export const JOURNEY_STEPS = ["Em preparação", "Pronta pra revisar", "Enviada"] as const

const JOURNEY_INDEX: Record<string, number> = {
  "NÃO INICIADA": 0,
  "EM PREPARAÇÃO": 1,
  "PRONTA PARA REVISÃO": 2,
  "ENVIO INCERTO": 2,
  ENVIADA: 3,
}

/** Completed steps (0–3) of the trail; null when the status is empty, invalid or RETIRADA. */
export function journeyStep(cell: CellDisplay): number | null {
  if (cell.invalid || cell.value === null) return null
  return JOURNEY_INDEX[cell.value] ?? null
}

const FLAMES: Record<string, number> = { BAIXO: 0, NORMAL: 1, ALTO: 2, MUITO_ALTO: 3 }

/** Interest as 0–3 flames; null outside the interest ladder (indefinido, legado, inválido, vazio). */
export function flameCount(cell: CellDisplay): number | null {
  if (cell.invalid || cell.value === null) return null
  return FLAMES[cell.value] ?? null
}

/**
 * The "Hoje" queue: SELECIONADA and ABERTA jobs whose application is still to be done (not sent,
 * withdrawn or uncertain), outside the archive. Highest interest first, then the furthest along,
 * then the most recently analysed.
 */
export function todayQueue(items: JobListItem[]): JobListItem[] {
  const queue = items.filter(
    (item) =>
      !item.archived &&
      !item.statusAnalise.invalid &&
      item.statusAnalise.value === "SELECIONADA" &&
      (jobState(item) === "aberta" || jobState(item) === "revisao")
  )
  return queue.sort(
    (a, b) =>
      interestRank(a) - interestRank(b) ||
      (journeyStep(b.statusCandidatura) ?? 0) - (journeyStep(a.statusCandidatura) ?? 0) ||
      byRecent(a, b)
  )
}
