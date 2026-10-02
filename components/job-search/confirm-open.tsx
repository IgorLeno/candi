"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { confirmJobOpen } from "@/app/actions/ops"
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
import { confirmOpenRefusalText } from "@/lib/ops/present"

/**
 * "Confirmei que está aberta": job-search only reads availability on LinkedIn, so a careers-site job stays NÃO
 * CONFIRMADA, and the automatic read can also mark an open job ENCERRADA; either way the application stays blocked.
 * The user checks the page; job-search writes ABERTA to the Sheet (keeping the old value in a reconciliation) and the
 * dossier. Behind a confirmation: it is the user's word, never inferred.
 */
export function ConfirmOpenButton({
  jobId,
  label,
  postingUrl,
  closed = false,
}: {
  jobId: string
  /** Company and role, shown in the confirmation. */
  label: string
  postingUrl: string | null
  /** The job is marked ENCERRADA: the dialog says it reopens it. */
  closed?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const safeUrl = safeHttpUrl(postingUrl)

  const run = () =>
    startTransition(async () => {
      try {
        const result = await confirmJobOpen(jobId)
        if (!result.ok) {
          toast.error(confirmOpenRefusalText(result.code))
          router.refresh()
          return
        }
        toast.success("Disponibilidade gravada como ABERTA na planilha e no dossier.")
        setOpen(false)
        router.refresh()
      } catch {
        toast.error(confirmOpenRefusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <>
      <Button size="sm" variant="outline" className="h-7" data-testid="confirm-open" onClick={() => setOpen(true)}>
        <CircleCheck className="h-4 w-4" aria-hidden="true" />
        Confirmei que está aberta
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent data-testid="confirm-open-dialog">
          <DialogHeader>
            <DialogTitle>{closed ? "Reabrir uma vaga marcada como ENCERRADA?" : "A vaga está aberta?"}</DialogTitle>
            <DialogDescription>
              {closed
                ? `${label}. A vaga está marcada como ENCERRADA na planilha, mas a leitura automática pode errar. Confirme só se você abriu a publicação agora e ela aceita candidaturas: o job-search troca ENCERRADA por ABERTA na planilha e no dossier, guarda o valor antigo na reconciliação, e a candidatura é liberada.`
                : `${label}. O job-search só confere sozinho as vagas do LinkedIn. Confirme só se você abriu a publicação agora e ela aceita candidaturas: o job-search grava a disponibilidade como ABERTA na planilha e no dossier, e a candidatura é liberada.`}
            </DialogDescription>
          </DialogHeader>
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm text-primary underline underline-offset-4"
              data-testid="confirm-open-link"
            >
              Abrir a publicação
            </a>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)} data-testid="confirm-open-cancel">
              Cancelar
            </Button>
            <Button disabled={pending} onClick={run} data-testid="confirm-open-confirm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {closed ? "Reabrir: está aberta" : "Está aberta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
