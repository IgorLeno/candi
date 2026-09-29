"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, LayoutGrid, Rows3, Search, SlidersHorizontal, X } from "lucide-react"
import {
  DEFAULT_FILTERS,
  FACET_LABELS,
  ISSUE_LABELS,
  facetOptionLabel,
  facetOptions,
  filtersToParams,
  formatDay,
  jobHref,
  matchesFilters,
  sortJobs,
  type FacetKey,
  type JobFilters,
  type JobListItem,
  type SortKey,
} from "@/lib/job-search/present"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnalysisBadge, CellBadge } from "@/components/job-search/cell-badge"
import { ToneBadge } from "@/components/job-search/tone-badge"
import { JobCard, StateLegend } from "@/components/job-search/visual"
import { cn } from "@/lib/utils"

const PRIMARY_FACETS: FacetKey[] = ["status_analise", "status_candidatura", "interesse", "analysis"]
const MORE_FACETS: FacetKey[] = [
  "status_disponibilidade",
  "familia_funcao",
  "setor",
  "tipo_programa",
  "proximidade_eq",
  "fonte_descoberta",
  "portal_candidatura",
  "zona",
  "modalidade",
]
const ALL = "__all__"

// Cards or table: a per-browser convenience, so it lives in localStorage rather than the URL.
type ListView = "cards" | "tabela"
const VIEW_KEY = "estagios:vista-vagas"

// Fallback when storage is blocked: the choice then lasts until the page is reloaded.
let memoryView: ListView = "cards"

function readView(): ListView {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    return stored === "tabela" || stored === "cards" ? stored : memoryView
  } catch {
    return memoryView
  }
}

const VIEW_EVENT = "estagios:vista-vagas-change"

function subscribeView(onChange: () => void): () => void {
  window.addEventListener(VIEW_EVENT, onChange)
  return () => window.removeEventListener(VIEW_EVENT, onChange)
}

function saveView(view: ListView) {
  memoryView = view
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Storage blocked: memoryView keeps the choice for this page load.
  }
  window.dispatchEvent(new Event(VIEW_EVENT))
}

// Long status names wrap inside their column instead of spilling into the next one.
const WRAP = "whitespace-normal text-left"

function FacetSelect({
  facet,
  items,
  value,
  onChange,
}: {
  facet: FacetKey
  items: JobListItem[]
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const options = facetOptions(items, facet)
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {FACET_LABELS[facet]}
      <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
        <SelectTrigger className="w-full bg-card" data-testid={`filter-${facet}`} aria-label={FACET_LABELS[facet]}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {facetOptionLabel(facet, option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

export function JobsExplorer({ items, initialFilters }: { items: JobListItem[]; initialFilters: JobFilters }) {
  const pathname = usePathname()
  const [filters, setFilters] = useState<JobFilters>(initialFilters)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(() => MORE_FACETS.some((facet) => initialFilters.facets[facet]))
  // Server render and hydration both start on cards; the stored choice applies right after.
  const view = useSyncExternalStore(subscribeView, readView, () => "cards" as ListView)
  const changeView = saveView

  const visible = useMemo(
    () =>
      sortJobs(
        items.filter((item) => matchesFilters(item, filters)),
        filters.sort
      ),
    [items, filters]
  )

  // Filters live in the URL so overview links and shared links open the same slice. The
  // History API updates it without a server round-trip (filtering is client-side).
  const update = (next: JobFilters) => {
    setFilters(next)
    const query = filtersToParams(next).toString()
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
  }
  const setFacet = (facet: FacetKey, value: string | undefined) =>
    update({ ...filters, facets: { ...filters.facets, [facet]: value } })

  const activeCount =
    Object.values(filters.facets).filter(Boolean).length +
    (filters.q ? 1 : 0) +
    (filters.arquivo !== "todas" ? 1 : 0) +
    (filters.envioIncerto ? 1 : 0) +
    (filters.comProblema ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Buscar por empresa, cargo, job_id ou frase-núcleo"
              placeholder="Buscar empresa, cargo, job_id…"
              value={filters.q}
              onChange={(event) => update({ ...filters, q: event.target.value })}
              className="bg-card pl-9"
              data-testid="search-input"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Ordenar
            <Select value={filters.sort} onValueChange={(sort) => update({ ...filters, sort: sort as SortKey })}>
              <SelectTrigger className="w-40 bg-card" data-testid="sort-select" aria-label="Ordenar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interesse">Interesse</SelectItem>
                <SelectItem value="recentes">Análise mais recente</SelectItem>
                <SelectItem value="empresa">Empresa (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRIMARY_FACETS.map((facet) => (
            <FacetSelect
              key={facet}
              facet={facet}
              items={items}
              value={filters.facets[facet]}
              onChange={(value) => setFacet(facet, value)}
            />
          ))}
        </div>

        {showMore && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="more-filters">
            {MORE_FACETS.map((facet) => (
              <FacetSelect
                key={facet}
                facet={facet}
                items={items}
                value={filters.facets[facet]}
                onChange={(value) => setFacet(facet, value)}
              />
            ))}
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
              Registro
              <Select
                value={filters.arquivo}
                onValueChange={(arquivo) => update({ ...filters, arquivo: arquivo as JobFilters["arquivo"] })}
              >
                <SelectTrigger className="w-full bg-card" aria-label="Registro">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Ativas e encerradas</SelectItem>
                  <SelectItem value="ativas">Só aba principal</SelectItem>
                  <SelectItem value="encerradas">Só Encerradas</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowMore(!showMore)} data-testid="toggle-more-filters">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {showMore ? "Menos filtros" : "Mais filtros"}
          </Button>
          <Button
            variant={filters.envioIncerto ? "default" : "outline"}
            size="sm"
            aria-pressed={filters.envioIncerto}
            onClick={() => update({ ...filters, envioIncerto: !filters.envioIncerto })}
            data-testid="toggle-envio-incerto"
          >
            Envio incerto
          </Button>
          <Button
            variant={filters.comProblema ? "default" : "outline"}
            size="sm"
            aria-pressed={filters.comProblema}
            onClick={() => update({ ...filters, comProblema: !filters.comProblema })}
            data-testid="toggle-problemas"
          >
            Com problema de dados
          </Button>
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ ...DEFAULT_FILTERS, sort: filters.sort })}
              data-testid="clear-filters"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Limpar filtros ({activeCount})
            </Button>
          )}
          <p className="ml-auto text-sm text-muted-foreground" data-testid="result-count" aria-live="polite">
            {visible.length} de {items.length} vagas
          </p>
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Visualização">
            <Button
              variant={view === "cards" ? "default" : "ghost"}
              size="sm"
              aria-pressed={view === "cards"}
              onClick={() => changeView("cards")}
              data-testid="view-cards"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              Cartões
            </Button>
            <Button
              variant={view === "tabela" ? "default" : "ghost"}
              size="sm"
              aria-pressed={view === "tabela"}
              onClick={() => changeView("tabela")}
              data-testid="view-table"
            >
              <Rows3 className="h-4 w-4" aria-hidden="true" />
              Tabela
            </Button>
          </div>
        </div>
      </div>

      <StateLegend />

      {visible.length === 0 ? (
        <p
          className="rounded-2xl border border-dashed border-border bg-card/50 py-12 text-center text-sm text-muted-foreground"
          data-testid="empty-list"
        >
          {items.length === 0 ? "Nenhuma vaga no registro." : "Nenhuma vaga corresponde aos filtros."}
        </p>
      ) : view === "cards" ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="job-list">
          {visible.map((item, index) => (
            <JobCard key={item.jobId} item={item} index={index} />
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div
            className="hidden grid-cols-[2rem_minmax(0,2fr)_repeat(4,minmax(0,1fr))_5.5rem] gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground lg:grid"
            aria-hidden="true"
          >
            <span />
            <span>Vaga</span>
            <span>Interesse</span>
            <span>Análise</span>
            <span>Candidatura</span>
            <span>Dossier</span>
            <span className="text-right">Última análise</span>
          </div>
          <ul data-testid="job-list">
            {visible.map((item) => (
              <JobRowItem
                key={item.jobId}
                item={item}
                expanded={expanded === item.jobId}
                onToggle={() => setExpanded(expanded === item.jobId ? null : item.jobId)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function JobRowItem({ item, expanded, onToggle }: { item: JobListItem; expanded: boolean; onToggle: () => void }) {
  const detailsId = `job-details-${item.jobId}`
  return (
    <li
      className={cn("border-b border-border/60 last:border-b-0", expanded && "bg-primary/5")}
      data-testid="job-row"
      data-job-id={item.jobId}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[2rem_minmax(0,2fr)_repeat(4,minmax(0,1fr))_5.5rem]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={expanded ? "Recolher resumo" : "Expandir resumo"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <Link
            prefetch={false}
            href={jobHref(item.jobId)}
            className="block truncate font-semibold text-foreground hover:text-st-open-fg"
            data-testid="job-link"
          >
            {item.empresa || "(sem empresa)"}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {item.cargo || "(sem cargo)"}
            {item.local && <span> · {item.local}</span>}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {item.uncertainSubmit && <ToneBadge tone="critical">Envio incerto</ToneBadge>}
            {item.archived && <ToneBadge tone="muted">Encerradas</ToneBadge>}
          </div>
        </div>
        {/* Below lg the badges wrap under the title. */}
        <div className="col-start-2 flex flex-wrap gap-1.5 lg:contents">
          <span className="min-w-0 lg:flex lg:items-center">
            <CellBadge cell={item.interesse} testId="row-interesse" className={WRAP} />
          </span>
          <span className="min-w-0 lg:flex lg:items-center">
            <CellBadge cell={item.statusAnalise} className={WRAP} />
          </span>
          <span className="min-w-0 lg:flex lg:items-center">
            <CellBadge cell={item.statusCandidatura} testId="row-candidatura" className={WRAP} />
          </span>
          <span className="min-w-0 lg:flex lg:items-center">
            <AnalysisBadge level={item.analysis} testId="row-analysis" className={WRAP} />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums lg:text-right">
            {formatDay(item.dataUltimaAnalise)}
          </span>
        </div>
      </div>
      {expanded && (
        <div id={detailsId} className="space-y-2 px-4 pb-4 pl-[3.75rem] text-sm">
          {item.coreSentence ? (
            <p className="text-foreground">
              <span className="text-muted-foreground">Frase-núcleo: </span>
              {item.coreSentence}
            </p>
          ) : (
            <p className="italic text-muted-foreground">Sem frase-núcleo: vaga sem dossier válido.</p>
          )}
          {item.motivo && (
            <p className="whitespace-pre-wrap break-words text-muted-foreground">Motivo: {item.motivo}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Disponibilidade:</span>
            <CellBadge cell={item.statusDisponibilidade} />
            {item.issueCodes.map((code) => (
              <ToneBadge
                key={code}
                tone={code === "UNCERTAIN_SUBMIT" || code === "DOSSIER_INVALID" ? "critical" : "warning"}
              >
                {ISSUE_LABELS[code]}
              </ToneBadge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            job_id <span className="font-mono">{item.jobId}</span> · primeira análise{" "}
            {formatDay(item.dataPrimeiraAnalise)}
          </p>
        </div>
      )}
    </li>
  )
}
