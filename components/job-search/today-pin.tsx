"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Pin, PinOff } from "lucide-react"
import { toast } from "sonner"
import { pinTodayJob, unpinTodayJob } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import { refusalText } from "@/lib/ops/present"

/**
 * "Tirar da fila" on a pinned Hoje card (plan 2026-10-22): job-search unpins the job and rewrites the list at once
 * (it goes to "Fora da lista" as DESFIXADA). Nothing changes in the Sheet, and "Pôr na fila" puts it back, so there is
 * no confirmation.
 */
export function UnpinTodayButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      className="relative z-10"
      disabled={pending}
      data-testid="today-unpin"
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await unpinTodayJob(jobId)
            if (!result.ok) {
              toast.error(refusalText(result.code))
              return
            }
            toast.success("Vaga tirada da fila.")
            router.refresh()
          } catch {
            toast.error(refusalText("REQUEST_FAILED"))
          }
        })
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <PinOff className="h-4 w-4" aria-hidden="true" />
      )}
      Tirar da fila
    </Button>
  )
}

/**
 * "Pôr na fila" (plan 2026-10-22): job-search pins the job on the Hoje list at once, without asking for SELECIONADA
 * (the user chose it); it stays until sent, discarded or taken out, up to 5. Already in the queue: "Na fila". Only the
 * job_id leaves the panel; the page is read again so the queue shows it without a reload.
 */
export function PinTodayButton({
  jobId,
  queued,
  testId = "today-add-pin",
  queuedTestId = "today-add-queued",
}: {
  jobId: string
  queued: boolean
  testId?: string
  queuedTestId?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  if (queued || done)
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground"
        data-testid={queuedTestId}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Na fila
      </span>
    )
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      data-testid={testId}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await pinTodayJob(jobId)
            if (!result.ok) {
              toast.error(refusalText(result.code))
              return
            }
            setDone(true)
            toast.success("Vaga posta na fila.")
            router.refresh()
          } catch {
            toast.error(refusalText("REQUEST_FAILED"))
          }
        })
      }
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Pin className="h-4 w-4" aria-hidden="true" />
      )}
      Pôr na fila
    </Button>
  )
}
