"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { declineJob } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { refusalText } from "@/lib/ops/present"
import { cn } from "@/lib/utils"

/**
 * "Descartar vaga": the user decides not to apply. job-search writes RETIRADA (USER_DECLINED) to the Sheet;
 * the job stays listed with the red "descartada" stamp. Behind a confirmation, with no undo.
 */
export function DeclineJobButton({
  jobId,
  label,
  className,
}: {
  jobId: string
  /** Company and role, shown in the confirmation. */
  label: string
  className?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      try {
        const result = await declineJob(jobId)
        if (!result.ok) {
          toast.error(refusalText(result.code))
          router.refresh()
          return
        }
        toast.success("Vaga descartada e marcada como RETIRADA na planilha.")
        setOpen(false)
        router.refresh()
      } catch {
        toast.error(refusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        data-testid="decline-job"
        className={cn(
          "relative z-10 border-destructive/50 text-destructive hover:bg-destructive/10 dark:border-destructive/50 dark:hover:border-destructive dark:hover:bg-destructive/15",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Descartar vaga
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent data-testid="decline-job-dialog">
          <DialogHeader>
            <DialogTitle>Descartar esta vaga?</DialogTitle>
            <DialogDescription>
              {label}. O job-search grava a candidatura como RETIRADA na planilha. A vaga continua na lista com o
              carimbo &ldquo;descartada&rdquo; e sai da fila. Não dá para desfazer pelo painel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)} data-testid="decline-job-cancel">
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pending} onClick={run} data-testid="decline-job-confirm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
