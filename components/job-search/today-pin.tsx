"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PinOff } from "lucide-react"
import { toast } from "sonner"
import { unpinTodayJob } from "@/app/actions/ops"
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
            toast.error(refusalText("UNAUTHENTICATED"))
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
