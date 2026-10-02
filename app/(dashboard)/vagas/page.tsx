import { getJobSearchData } from "@/lib/job-search/source"
import { filtersToParams, parseFilters, toListItem } from "@/lib/job-search/present"
import { PageHeader } from "@/components/job-search/page-header"
import { JobsExplorer } from "@/components/job-search/jobs-explorer"

export default async function VagasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const data = await getJobSearchData()
  const filters = parseFilters(await searchParams)
  // Only the slim projection reaches the client: no posting text or dossier body.
  const items = data.views.map(toListItem)

  return (
    <>
      <PageHeader
        title="Vagas"
        description="Todas as vagas do registro, com filtros pelos eixos do job-search."
        data={data}
      />
      {/* A navigation to another filtered URL remounts the explorer with those filters. */}
      <JobsExplorer key={filtersToParams(filters).toString()} items={items} initialFilters={filters} />
    </>
  )
}
