"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertOctagon, AlertTriangle, FileSpreadsheet, Hand, Loader2 } from "lucide-react"
import { listAttention } from "@/app/actions/ops"
import { TONE_CLASSES } from "@/components/job-search/tone-badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ATTENTION_REFRESH_EVENT,
  attentionBadge,
  attentionTitle,
  needsUserCount,
  newlyWaiting,
  waitingIds,
  type AttentionEntry,
} from "@/lib/ops/attention"
import { ACTION_META } from "@/lib/ops/present"
import { cn } from "@/lib/utils"

// "Em andamento" (2026-10-07): what the bots are doing and what waits on the user, on every page. job-search decides
// (`dispatch.py attention`); an item leaves only when job-search resolves it (resumed, dismissed on its card,
// registered, a newer run). Opening the job does not clear it.

const POLL_IDLE_MS = 60_000
const POLL_RUNNING_MS = 10_000

export interface Attention {
  entries: AttentionEntry[] | null
  error: boolean
}

/** One read per page change, then a light poll (paused while the tab is hidden). Toasts only new waits. */
export function useAttention(enabled: boolean): Attention {
  const pathname = usePathname()
  const router = useRouter()
  const [entries, setEntries] = useState<AttentionEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [disabled, setDisabled] = useState(!enabled)
  const previous = useRef<Set<string> | null>(null)
  const inFlight = useRef(false)
  const page = useRef(pathname)

  useEffect(() => {
    page.current = pathname
  }, [pathname])

  const refresh = useCallback(async () => {
    if (disabled || inFlight.current) return
    inFlight.current = true
    try {
      const result = await listAttention()
      if (result.ok) {
        for (const entry of newlyWaiting(previous.current, result.value, page.current)) {
          const badge = attentionBadge(entry)
          toast.warning(`${attentionTitle(entry)}: ${badge.label.toLowerCase()}`, {
            description: ACTION_META[entry.action].label,
            duration: 15_000,
            action: { label: "Abrir", onClick: () => router.push(entry.href) },
          })
        }
        previous.current = waitingIds(result.value)
        setEntries(result.value)
        setError(false)
      } else if (result.code === "DISPATCH_DISABLED") {
        setDisabled(true)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      inFlight.current = false
    }
  }, [disabled, router])

  useEffect(() => {
    void refresh()
  }, [refresh, pathname])

  const running = entries?.some((entry) => entry.kind === "RUNNING") ?? false
  useEffect(() => {
    if (disabled) return
    const now = () => {
      if (!document.hidden) void refresh()
    }
    const timer = window.setInterval(now, running ? POLL_RUNNING_MS : POLL_IDLE_MS)
    document.addEventListener("visibilitychange", now)
    window.addEventListener(ATTENTION_REFRESH_EVENT, now)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", now)
      window.removeEventListener(ATTENTION_REFRESH_EVENT, now)
    }
  }, [disabled, running, refresh])

  return { entries: disabled ? null : entries, error: !disabled && error }
}

function EntryIcon({ entry }: { entry: AttentionEntry }) {
  const className = "h-3.5 w-3.5 shrink-0"
  if (entry.kind === "RUNNING")
    return <Loader2 className={cn(className, "motion-safe:animate-spin")} aria-hidden="true" />
  if (entry.kind === "WRITESET_PENDING") return <FileSpreadsheet className={className} aria-hidden="true" />
  if (entry.status === "MANUAL") return <Hand className={className} aria-hidden="true" />
  const tone = attentionBadge(entry).tone
  const Icon = tone === "critical" ? AlertOctagon : AlertTriangle
  return <Icon className={className} aria-hidden="true" />
}

function EntryList({ entries, onNavigate }: { entries: AttentionEntry[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1" data-testid="in-progress-list">
      {entries.map((entry) => {
        const badge = attentionBadge(entry)
        return (
          <li key={entry.id}>
            <Link
              prefetch={false}
              href={entry.href}
              onClick={onNavigate}
              data-testid="in-progress-item"
              data-kind={entry.kind}
              className={cn(
                "block rounded-lg px-3 py-2 text-xs transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                "hover:bg-sidebar-border/40"
              )}
            >
              <span className="block truncate font-medium text-sidebar-foreground">{attentionTitle(entry)}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px font-medium",
                    TONE_CLASSES[badge.tone]
                  )}
                >
                  <EntryIcon entry={entry} />
                  {badge.label}
                </span>
                <span className="truncate text-sidebar-foreground/70">{ACTION_META[entry.action].label}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      data-testid="in-progress-count"
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-st-uncertain px-1.5 text-[11px] font-bold text-st-uncertain-ink"
    >
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count === 1 ? "1 precisa de você" : `${count} precisam de você`}</span>
    </span>
  )
}

function Empty({ error }: { error: boolean }) {
  return (
    <p className="px-3 py-1 text-xs text-sidebar-foreground/70" data-testid="in-progress-empty">
      {error ? "Não deu para ler os disparos agora." : "Nada rodando nem esperando você."}
    </p>
  )
}

/** Desktop sidebar section. */
export function InProgressSection({ attention }: { attention: Attention }) {
  const { entries, error } = attention
  if (entries === null && !error) return null
  const list = entries ?? []
  return (
    <section aria-labelledby="in-progress-title" data-testid="in-progress" className="relative px-3 pb-3">
      <div className="mb-2 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
      <h2
        id="in-progress-title"
        className="flex items-center justify-between px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80"
      >
        Em andamento
        <CountBadge count={needsUserCount(list)} />
      </h2>
      {list.length === 0 ? (
        <Empty error={error} />
      ) : (
        <div className="max-h-[40vh] overflow-y-auto">
          {error && <Empty error />}
          <EntryList entries={list} />
        </div>
      )}
    </section>
  )
}

/** Mobile top bar: a chip that opens the same list. */
export function InProgressChip({ attention }: { attention: Attention }) {
  const [open, setOpen] = useState(false)
  const { entries, error } = attention
  if (entries === null && !error) return null
  const list = entries ?? []
  const count = needsUserCount(list)
  const running = list.length - count
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="in-progress-chip"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            count > 0 ? "text-st-uncertain-fg" : "text-sidebar-foreground"
          )}
        >
          {count > 0 ? (
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Loader2 className={cn("h-3.5 w-3.5", running > 0 && "motion-safe:animate-spin")} aria-hidden="true" />
          )}
          {count > 0 ? `${count} · ${count === 1 ? "precisa" : "precisam"} de você` : "Em andamento"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="in-progress-popover"
        className="w-[min(20rem,calc(100vw-2rem))] bg-sidebar p-2"
      >
        <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/80">
          Em andamento
        </h2>
        {list.length === 0 ? <Empty error={error} /> : <EntryList entries={list} onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  )
}
