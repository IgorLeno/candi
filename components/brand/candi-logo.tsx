import { cn } from "@/lib/utils"

/**
 * Candi mark: a dark tile with a lime "C", a check in its opening and a dot.
 * Same geometry as `public/icon.svg`; colors come from theme tokens so the mark
 * stays dark-on-lime in both themes. Decorative: the name is always written next to it.
 */
export function CandiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("flex-shrink-0", className)} aria-hidden="true" focusable="false">
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        strokeWidth="1.5"
        className="fill-sidebar-primary-foreground stroke-st-open/70"
      />
      <path
        d="M30 13H22a11 11 0 0 0 0 22h8"
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        className="stroke-st-open"
      />
      <path
        d="M20 24l3.5 3.5L30 21"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-st-open"
      />
      <circle cx="37" cy="24" r="2.5" className="fill-st-open" />
    </svg>
  )
}
