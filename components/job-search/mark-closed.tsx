"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleSlash, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { markJobClosed } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { safeHttpUrl } from "@/lib/job-search/present"
import { markClosedRefusalText } from "@/lib/ops/present"

/**
 * "Vaga encerrada": the user saw that the job no longer takes applications (on the posting, or Claude in Chrome said
 * so while filling the form). job-search writes ENCERRADA to the Sheet (keeping the old value in a reconciliation)
 * and the dossier; the application is left as it is. "Confirmei que está aberta" undoes it.
 */
export function MarkClosedButton({
  jobId,
  label,
  postingUrl,
}: {
  jobId: string
  /** Company and role, shown in the confirmation. */
  label: string
  postingUrl: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const safeUrl = safeHttpUrl(postingUrl)

  const run = () =>
    startTransition(async () => {
      try {
        const result = await markJobClosed(jobId)
        if (!result.ok) {
          toast.error(markClosedRefusalText(result.code))
          router.refresh()
          return
        }
        toast.success("Disponibilidade gravada como ENCERRADA na planilha e no dossier.")
        setOpen(false)
        router.refresh()
      } catch {
        toast.error(markClosedRefusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <>
      <Button size="sm" variant="outline" className="h-7" data-testid="mark-closed" onClick={() => setOpen(true)}>
        <CircleSlash className="h-4 w-4" aria-hidden="true" />
        Vaga encerrada
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent data-testid="mark-closed-dialog">
          <DialogHeader>
            <DialogTitle>A vaga foi encerrada?</DialogTitle>
            <DialogDescription>
              {`${label}. Confirme só se a publicação ou o portal diz que a vaga não aceita mais candidaturas (o Claude avisa no chat quando vê isso). O job-search grava a disponibilidade como ENCERRADA na planilha e no dossier, guarda o valor antigo na reconciliação e não mexe na candidatura. Se errar, "Confirmei que está aberta" desfaz.`}
            </DialogDescription>
          </DialogHeader>
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm text-primary underline underline-offset-4"
              data-testid="mark-closed-link"
            >
              Abrir a publicação
            </a>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)} data-testid="mark-closed-cancel">
              Cancelar
            </Button>
            <Button disabled={pending} onClick={run} data-testid="mark-closed-confirm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Está encerrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
