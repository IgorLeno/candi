"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { applyLetter } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import { refusalText } from "@/lib/ops/present"
import type { Dispatch, LetterText } from "@/lib/ops/schema"

// "Editar carta" by request (decision C10, 2026-10-15): the ChatGPT rewrote the whole letter; the user reads before
// and after and approves or discards the letter as a whole (prose is not approved change by change). The panel only
// sends the decision; the text stays in job-search's proposal.

function LetterColumn({ title, text, testId }: { title: string; text: LetterText; testId: string }) {
  return (
    <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-border p-3 text-sm" data-testid={testId}>
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <p className="text-xs font-semibold tracking-wide">{text.subject}</p>
      <p>{text.greeting}</p>
      {text.paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {paragraph}
        </p>
      ))}
      <p>{text.closing}</p>
    </div>
  )
}

export function LetterProposalApproval({ dispatch, onChanged }: { dispatch: Dispatch; onChanged: () => void }) {
  const [pending, startTransition] = useTransition()
  const proposal = dispatch.progress.letter_proposal
  if (!proposal) return null
  const decide = (decision: "approve" | "reject") =>
    startTransition(async () => {
      try {
        const result = await applyLetter(dispatch.id, decision)
        if (result.ok) {
          toast.success(
            decision === "approve" ? "Carta aprovada; o PDF está sendo gerado." : "Carta proposta descartada."
          )
          onChanged()
        } else toast.error(refusalText(result.code))
      } catch {
        toast.error(refusalText("REQUEST_FAILED"))
      }
    })
  return (
    <div className="space-y-3" data-testid="letter-proposal">
      <p className="text-sm font-semibold">Leia a carta proposta pelo ChatGPT</p>
      <div className="flex flex-col gap-3 lg:flex-row">
        <LetterColumn title="Carta atual" text={proposal.before} testId="letter-proposal-before" />
        <LetterColumn title="Carta proposta" text={proposal.after} testId="letter-proposal-after" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} data-testid="letter-approve" onClick={() => decide("approve")}>
          ✓ Aprovar e gerar o PDF
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="letter-reject"
          onClick={() => decide("reject")}
        >
          Descartar
        </Button>
      </div>
    </div>
  )
}
