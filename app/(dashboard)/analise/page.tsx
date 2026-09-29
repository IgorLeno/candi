import Link from "next/link"
import { getJobSearchData } from "@/lib/job-search/source"
import {
  analysesPerWeek,
  applicationsPerWeek,
  computeFunnel,
  computeKpis,
  coverageBySource,
  distribution,
  filterByPeriod,
  inPeriod,
  qualitySummary,
  type DistributionKey,
} from "@/lib/job-search/metrics"
import { PERIODS, attentionGroups, parsePeriod, periodRange, type FacetKey } from "@/lib/job-search/present"
import { PageHeader } from "@/components/job-search/page-header"
import { WeeklyChart } from "@/components/job-search/weekly-chart"
import {
  AttentionPanel,
  CoverageTable,
  DistributionCard,
  Funnel,
  KpiRow,
  QualityPanel,
  SectionCard,
} from "@/components/job-search/overview"
import { cn } from "@/lib/utils"

const DISTRIBUTIONS: { key: DistributionKey; title: string; facet?: FacetKey; emptyLabel?: string }[] = [
  { key: "interesse", title: "Interesse", facet: "interesse" },
  { key: "status_analise", title: "Status da análise", facet: "status_analise" },
  { key: "status_candidatura", title: "Status da candidatura", facet: "status_candidatura" },
  { key: "status_disponibilidade", title: "Disponibilidade", facet: "status_disponibilidade" },
  { key: "familia_funcao", title: "Família funcional", facet: "familia_funcao" },
  { key: "setor", title: "Setor", facet: "setor" },
  { key: "proximidade_eq", title: "Proximidade com EQ", facet: "proximidade_eq" },
  { key: "tipo_programa", title: "Tipo de programa", facet: "tipo_programa" },
  { key: "fonte_descoberta", title: "Fonte de descoberta", facet: "fonte_descoberta" },
  { key: "portal_candidatura", title: "Portal de candidatura", facet: "portal_candidatura" },
  { key: "zona", title: "Zona (dossier)", facet: "zona", emptyLabel: "Sem dossier" },
  { key: "uf", title: "UF (dossier)", emptyLabel: "Sem dossier" },
  { key: "modalidade", title: "Modalidade (dossier)", facet: "modalidade", emptyLabel: "Sem dossier" },
]

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const data = await getJobSearchData()
  const periodId = parsePeriod(params.periodo)
  const period = periodRange(periodId, new Date().toISOString().slice(0, 10))
  const views = filterByPeriod(data.views, period)
  const coverageRows = data.coverage.filter((row) => inPeriod(row.data_execucao, period))

  // Attention reflects the current state of every job, whatever the period.
  const attention = attentionGroups(data.views)

  return (
    <>
      <PageHeader
        title="Análise"
        description="Funil, evolução, distribuições e qualidade dos dados, lidos do registro do job-search."
        data={data}
      >
        <nav aria-label="Período" className="flex rounded-lg border border-border bg-card p-0.5">
          {PERIODS.map((option) => (
            <Link
              prefetch={false}
              key={option.id}
              href={option.id === "tudo" ? "/analise" : `/analise?periodo=${option.id}`}
              aria-current={option.id === periodId ? "page" : undefined}
              data-testid={`period-${option.id}`}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                option.id === periodId
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </PageHeader>

      {data.views.length === 0 ? (
        <SectionCard title="Registro vazio">
          <p className="text-sm text-muted-foreground">
            Nenhuma vaga com job_id foi encontrada na fonte. Assim que o job-search registrar vagas, elas aparecem aqui.
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <KpiRow kpis={computeKpis(views)} />
          {periodId !== "tudo" && (
            <p className="-mt-3 text-xs text-muted-foreground">
              Período aplicado pela data da primeira análise (vagas) e da execução (cobertura).
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-5">
            <SectionCard
              title="Precisa de atenção"
              description="Estado atual de todas as vagas, independente do período."
              className="lg:col-span-2"
              testId="attention-panel"
            >
              <AttentionPanel groups={attention} />
            </SectionCard>
            <div className="grid gap-6 lg:col-span-3">
              <SectionCard title="Funil da busca" description="Contagem de cada etapa; percentual sobre as analisadas.">
                <Funnel stages={computeFunnel(views)} />
              </SectionCard>
              <SectionCard title="Evolução semanal" description="Primeira análise e data de candidatura por semana.">
                <WeeklyChart analyses={analysesPerWeek(views)} applications={applicationsPerWeek(views)} />
              </SectionCard>
            </div>
          </div>

          <section aria-labelledby="distribuicoes">
            <h2 id="distribuicoes" className="mb-3 text-lg font-semibold text-foreground">
              Distribuições
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {DISTRIBUTIONS.map((item) => (
                <DistributionCard
                  key={item.key}
                  title={item.title}
                  buckets={distribution(views, item.key)}
                  total={views.length}
                  facet={item.facet}
                  emptyLabel={item.emptyLabel}
                  testId={`dist-${item.key}`}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Cobertura de fontes"
              description="Resultado de cada execução por fonte (aba Cobertura de Fontes)."
              testId="coverage-card"
            >
              <CoverageTable sources={coverageBySource(data.coverage, period)} rows={coverageRows} />
            </SectionCard>
            <SectionCard
              title="Qualidade dos dados"
              description="Completude da análise e problemas detectados na leitura. Nada é corrigido aqui."
            >
              <QualityPanel
                summary={qualitySummary({ views, issues: data.issues })}
                total={views.length}
                snapshotIssues={data.issues}
              />
            </SectionCard>
          </div>
        </div>
      )}
    </>
  )
}
