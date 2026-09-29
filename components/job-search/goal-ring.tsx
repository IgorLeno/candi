"use client"

import Link from "next/link"
import { Trophy } from "lucide-react"
import { listHref } from "@/lib/job-search/present"
import { useWeeklyGoal } from "@/lib/weekly-goal"
import { cn } from "@/lib/utils"

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Weekly goal ring: applications dated this week against the goal set in Configurações. */
export function GoalRing({ sent }: { sent: number }) {
  const goal = useWeeklyGoal()
  const progress = Math.min(sent / goal, 1)
  const done = sent >= goal
  return (
    <Link
      prefetch={false}
      href={listHref({ status_candidatura: "ENVIADA" })}
      data-testid="goal-ring"
      data-sent={sent}
      data-goal={goal}
      className="group flex shrink-0 flex-col items-center gap-1 rounded-2xl p-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`Meta da semana: ${sent} de ${goal} candidaturas enviadas`}
    >
      <span className="relative block h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
          <circle
            key={goal}
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className={cn("animate-ring-fill", done ? "stroke-st-sent" : "stroke-st-open")}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            style={{ ["--ring-length" as string]: `${CIRCUMFERENCE}` }}
            opacity={progress === 0 ? 0 : 1}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          {done ? (
            <Trophy className="h-6 w-6 text-st-sent-fg" />
          ) : (
            <span className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
              {sent}
              <span className="text-base text-muted-foreground">/{goal}</span>
            </span>
          )}
        </span>
      </span>
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground">
        {done ? `meta batida: ${sent}/${goal}` : "enviadas na semana"}
      </span>
    </Link>
  )
}
