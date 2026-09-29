import type React from "react"
import { AlertOctagon, AlertTriangle } from "lucide-react"
import type { Tone } from "@/lib/job-search/present"
import { cn } from "@/lib/utils"

export const TONE_CLASSES: Record<Tone, string> = {
  good: "bg-st-open/15 text-st-open-fg border-st-open/40",
  warning: "bg-st-review/15 text-st-review-fg border-st-review/45",
  critical: "bg-st-uncertain/15 text-st-uncertain-fg border-st-uncertain/45",
  info: "bg-st-info/15 text-st-info-fg border-st-info/40",
  neutral: "bg-secondary text-secondary-foreground border-border",
  muted: "bg-muted/60 text-muted-foreground border-border",
}

/** Status pill: the text always carries the meaning; warning/critical add an icon, never color alone. */
export function ToneBadge({
  tone,
  children,
  className,
  title,
  ...props
}: {
  tone: Tone
  children: React.ReactNode
  className?: string
  title?: string
} & React.HTMLAttributes<HTMLSpanElement>) {
  const Icon = tone === "critical" ? AlertOctagon : tone === "warning" ? AlertTriangle : null
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}
