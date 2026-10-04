"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { recordSent } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SENT_EVIDENCE, type SentEvidence } from "@/lib/ops/schema"
import { SENT_EVIDENCE_LABEL, recordSentRefusalText } from "@/lib/ops/present"

/**
 * "Registrar envio": Claude in Chrome stops before the portal's final button and the user clicks it; job-search never
 * sees that click. The user picks the strong evidence they saw (no free text) and job-search writes ENVIADA and a
 * SUBMITTED event. Behind a confirmation: there is no undo.
 */
export function RecordSentButton({ jobId, label }: { jobId: string; /** Company and role. */ label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [evidence, setEvidence] = useState<SentEvidence | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    setOpen(false)
    setEvidence(null)
    setSent(false)
  }
  const close = (next: boolean) => {
    if (pending) return
    if (next) setOpen(true)
    else reset()
  }

  const run = () =>
    startTransition(async () => {
      if (!evidence) return
      try {
        const result = await recordSent(jobId, evidence)
        if (!result.ok) {
          toast.error(recordSentRefusalText(result.code))
          router.refresh()
          return
        }
        toast.success("Envio registrado: candidatura ENVIADA na planilha.")
        reset()
        router.refresh()
      } catch {
        toast.error(recordSentRefusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <>
      <Button size="sm" variant="outline" data-testid="record-sent" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" aria-hidden="true" />
        Registrar envio
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent data-testid="record-sent-dialog">
          <DialogHeader>
            <DialogTitle>Você enviou a candidatura?</DialogTitle>
            <DialogDescription>
              {`${label}. Registre só depois de clicar você mesmo no botão final do portal. O job-search grava a candidatura como ENVIADA, com a data de hoje, e isso não tem volta.`}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2 text-sm" data-testid="record-sent-evidence">
            <legend className="mb-1 font-semibold">O que você viu depois de enviar?</legend>
            {SENT_EVIDENCE.map((key) => (
              <label key={key} className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`record-sent-${jobId}`}
                  className="mt-1 accent-primary"
                  value={key}
                  checked={evidence === key}
                  onChange={() => setEvidence(key)}
                />
                <span>
                  <span className="font-semibold text-foreground">{SENT_EVIDENCE_LABEL[key].label}</span>
                  <span className="block text-xs text-muted-foreground">{SENT_EVIDENCE_LABEL[key].description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={sent}
              onChange={(event) => setSent(event.target.checked)}
              data-testid="record-sent-check"
            />
            <span>Eu cliquei no botão final do portal e a candidatura foi enviada.</span>
          </label>
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => close(false)} data-testid="record-sent-cancel">
              Cancelar
            </Button>
            <Button disabled={pending || !evidence || !sent} onClick={run} data-testid="record-sent-confirm">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Registrar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
