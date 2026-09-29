import type React from "react"
import { Database } from "lucide-react"
import { formatTimestamp } from "@/lib/job-search/present"
import type { JobSearchData } from "@/lib/job-search/types"
import { SyncButton } from "@/components/job-search/sync-button"
import { cn } from "@/lib/utils"

const SOURCE_LABEL: Record<JobSearchData["source"], string> = {
  fixture: "Fixture local (dados fictícios)",
  sheets: "Google Sheet do job-search",
}

/** Where the data came from and when it was read. */
export function DataSourceLine({
  data,
  className,
}: {
  data: Pick<JobSearchData, "source" | "fetchedAt">
  className?: string
}) {
  return (
    <p
      className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}
      data-testid="data-source"
    >
      <Database className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{SOURCE_LABEL[data.source]}</span>
      <span aria-hidden="true">·</span>
      <span>lido em {formatTimestamp(data.fetchedAt)}</span>
    </p>
  )
}

export function PageHeader({
  title,
  description,
  data,
  children,
}: {
  title: string
  description?: string
  data?: Pick<JobSearchData, "source" | "fetchedAt">
  children?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {data && <DataSourceLine data={data} className="mt-2" />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {data && <SyncButton />}
      </div>
    </header>
  )
}
