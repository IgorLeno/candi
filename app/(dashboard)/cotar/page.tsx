import { getJobSearchData } from "@/lib/job-search/source"
import { PageHeader } from "@/components/job-search/page-header"
import { SearchOps } from "@/components/job-search/ops"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"

// "Cotar vagas": the bot searches (BUSCAR_VAGAS and the "vaga específica") live here, not on Hoje or /vagas.

export default async function CotarPage() {
  const data = await getJobSearchData()

  return (
    <>
      <PageHeader
        title="Cotar vagas"
        description="Peça aos bots do job-search uma cotação de vagas ou uma vaga específica."
        data={data}
      />
      {isDispatchEnabled() ? (
        <SearchOps knownJobIds={data.views.map((view) => view.job.job_id)} />
      ) : (
        <p
          className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
          data-testid="dispatch-off"
        >
          O disparo dos bots está desligado neste painel (JOB_SEARCH_DISPATCH_ENABLED).
        </p>
      )}
    </>
  )
}
