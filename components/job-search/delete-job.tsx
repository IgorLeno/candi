"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { deleteJob } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteJobConfirmed, deleteJobRefusalText } from "@/lib/ops/present"
import { cn } from "@/lib/utils"

/**
 * "Excluir vaga": the job leaves the Sheet (main row, Eventos, Dossiers; job-search keeps a local backup). Unlike
 * "Descartar", nothing stays listed and a future search may bring the job back. Strong confirmation: the user types
 * the job_id. No undo.
 */
export function DeleteJobButton({
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
  const [typed, setTyped] = useState("")
  const [pending, startTransition] = useTransition()
  const confirmed = deleteJobConfirmed(typed, jobId)

  const change = (next: boolean) => {
    if (pending) return
    setOpen(next)
    if (!next) setTyped("")
  }

  const run = () =>
    startTransition(async () => {
      try {
        const result = await deleteJob(jobId)
        if (!result.ok) {
          toast.error(deleteJobRefusalText(result.code))
          router.refresh()
          return
        }
        const { eventos, dossiers } = result.value
        toast.success(
          `Vaga excluída da planilha (linha principal, ${eventos} evento(s) e ${dossiers} dossier(s)). O job-search guardou um backup local.`
        )
        setOpen(false)
        router.push("/vagas")
      } catch {
        toast.error(deleteJobRefusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        data-testid="delete-job"
        className={cn("relative z-10 text-destructive hover:bg-destructive/10 hover:text-destructive", className)}
        onClick={() => setOpen(true)}
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        Excluir vaga
      </Button>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent data-testid="delete-job-dialog">
          <DialogHeader>
            <DialogTitle>Excluir esta vaga da planilha?</DialogTitle>
            <DialogDescription>
              {label}. O job-search apaga a linha da vaga, os eventos de candidatura e os dossiers dela na planilha
              (guarda antes um backup local). A vaga some do painel e sai da deduplicação: uma busca futura pode
              trazê-la de volta. Para só tirar a vaga da fila, use &ldquo;Descartar vaga&rdquo;. Não dá para desfazer
              pelo painel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-job-confirm-input">
              Digite <span className="font-mono font-semibold text-foreground">{jobId}</span> para confirmar
            </Label>
            <Input
              id="delete-job-confirm-input"
              data-testid="delete-job-input"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              disabled={pending}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && confirmed && !pending) run()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => change(false)} data-testid="delete-job-cancel">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !confirmed}
              onClick={run}
              data-testid="delete-job-confirm"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
