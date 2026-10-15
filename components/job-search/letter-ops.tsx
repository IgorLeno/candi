"use client"

import { Loader2, Mail, Plus, Trash2 } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { getLetterDoc, requestLetterEdit, saveLetterManual, startLetter } from "@/app/actions/ops"
import { DispatchCard, OpsBar, PdfPreview, toastRefusal, useJobOps } from "@/components/job-search/ops"
import { ToneBadge } from "@/components/job-search/tone-badge"
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
import { Textarea } from "@/components/ui/textarea"
import { INTAKE_MAX, intakeLength, normalizeIntake } from "@/lib/ops/intake"
import { ACTION_META, latest, refusalText } from "@/lib/ops/present"
import { LETTER_ACTION, LETTER_EDIT_ACTION, type LetterDoc, type LetterText } from "@/lib/ops/schema"
import { cn } from "@/lib/utils"

// "Carta de apresentação" (plan 2026-10-15-carta-de-apresentacao, decisions C1–C12): its own section on the job page,
// between Currículo and Candidatura. Same process as the local résumé; job-search owns the prompt, the checks, the
// template and the PDF. Never blocked by verdict or application state (decision 2026-10-02): only the same letter
// work already running disables the buttons.

const MAX_PARAGRAPHS = 6
const MIN_PARAGRAPHS = 3

export function JobLetterOps() {
  const { jobId, data, refresh } = useJobOps()
  const letter = latest(data?.dispatches ?? [], LETTER_ACTION)
  const edit = latest(data?.dispatches ?? [], LETTER_EDIT_ACTION)
  const job = data?.job
  const ready = job?.letter === "VALID"
  // A letter run or edit that finishes (or changes status, e.g. a proposal approved) means a new letter to show/edit.
  const version = [letter, edit].map((d) => `${d?.status ?? ""}@${d?.finished_at ?? ""}`).join(":")
  const busy = letter?.active ? "Geração da carta em andamento." : edit?.active ? "Edição da carta em andamento." : null
  return (
    <div className="space-y-4">
      {job?.letter_hint && (
        <p className="rounded-lg border border-st-info/40 bg-st-info/10 p-3 text-sm" data-testid="letter-hint">
          O anúncio desta vaga menciona carta de apresentação.
        </p>
      )}
      <OpsBar testId="job-ops-letter" label="Carta de apresentação desta vaga">
        <LetterGenerate jobId={jobId} disabledReason={busy} onStarted={refresh} />
        {job && (
          <ToneBadge tone={ready ? "good" : "muted"} className="ml-auto" data-testid="letter-status">
            {ready ? "Carta pronta" : "Carta não gerada"}
          </ToneBadge>
        )}
        {letter && (
          <div className="basis-full">
            <DispatchCard dispatch={letter} onChanged={refresh} />
          </div>
        )}
      </OpsBar>
      {/* Re-read the file whenever job-search's verdict on the letter or a letter run changes. */}
      <PdfPreview key={`${job?.letter ?? "?"}:${version}`} jobId={jobId} kind="letter" />
      <LetterEditForm
        jobId={jobId}
        docVersion={version}
        disabledReason={busy ?? (job && !ready ? "Gere a carta desta vaga antes de editar." : null)}
        onStarted={refresh}
      />
      {edit && <DispatchCard dispatch={edit} onChanged={refresh} />}
    </div>
  )
}

function LetterGenerate({
  jobId,
  disabledReason,
  onStarted,
}: {
  jobId: string
  disabledReason: string | null
  onStarted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const meta = ACTION_META.GERAR_CARTA
  return (
    <>
      <Button
        size="sm"
        disabled={!!disabledReason || pending}
        title={disabledReason ?? undefined}
        data-testid="letter-generate"
        onClick={() => setOpen(true)}
      >
        <Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {meta.verb}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{meta.label}</DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={pending}
              data-testid="letter-generate-confirm"
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await startLetter(jobId)
                    // Close before the toast: a toast action inside an open modal does not run (lesson 2026-10-04).
                    setOpen(false)
                    if (result.ok) {
                      toast.success("Carta pedida ao job-search: acompanhe o card.")
                      onStarted()
                    } else toastRefusal(result.code)
                  } catch {
                    setOpen(false)
                    toast.error(refusalText("UNAUTHENTICATED"))
                  }
                })
              }
            >
              {pending ? "Pedindo…" : meta.verb}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type LetterTab = "manual" | "request"

function LetterEditForm({
  jobId,
  docVersion,
  disabledReason,
  onStarted,
}: {
  jobId: string
  docVersion: string
  disabledReason: string | null
  onStarted: () => void
}) {
  const [tab, setTab] = useState<LetterTab>("manual")
  const tabs: { key: LetterTab; label: string }[] = [
    { key: "manual", label: "Manual" },
    { key: "request", label: "Pedir ajuste ao ChatGPT" },
  ]
  return (
    <section
      className="space-y-3 rounded-2xl border border-border p-4"
      data-testid="letter-edit"
      aria-label="Editar carta"
    >
      <h3 className="text-sm font-semibold">Editar carta</h3>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Modo de edição da carta">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            data-testid={`letter-mode-${item.key}`}
            onClick={() => setTab(item.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium",
              tab === item.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "manual" ? (
        <LetterManualEditor
          jobId={jobId}
          docVersion={docVersion}
          disabledReason={disabledReason}
          onStarted={onStarted}
        />
      ) : (
        <LetterRequest jobId={jobId} disabledReason={disabledReason} onStarted={onStarted} />
      )}
    </section>
  )
}

function textOf(doc: LetterDoc["doc"]): LetterText {
  return { subject: doc.subject, greeting: doc.greeting, paragraphs: [...doc.paragraphs], closing: doc.closing }
}

type ManualState = { state: "loading" } | { state: "none"; code: string } | { state: "ready"; sha: string }

/**
 * Manual: the whole letter text in plain fields. Reloads when a letter run or edit finishes (`docVersion`), so the
 * draft never points at a letter that changed underneath (CV_DOC_CHANGED lesson, 2026-10-10); job-search refuses a
 * stale save anyway (LETTER_DOC_CHANGED).
 */
export function LetterManualEditor({
  jobId,
  docVersion,
  disabledReason,
  onStarted,
}: {
  jobId: string
  docVersion: string
  disabledReason: string | null
  onStarted: () => void
}) {
  const [loaded, setLoaded] = useState<ManualState>({ state: "loading" })
  const [text, setText] = useState<LetterText | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let alive = true
    setLoaded({ state: "loading" })
    getLetterDoc(jobId)
      .then((result) => {
        if (!alive) return
        if (result.ok) {
          setLoaded({ state: "ready", sha: result.value.sha256 })
          setText(textOf(result.value.doc))
        } else setLoaded({ state: "none", code: result.code })
      })
      .catch(() => alive && setLoaded({ state: "none", code: "UNAUTHENTICATED" }))
    return () => {
      alive = false
    }
  }, [jobId, docVersion])
  if (loaded.state === "loading") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="letter-manual-loading">
        <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden="true" />
        Abrindo a carta desta vaga…
      </p>
    )
  }
  if (loaded.state === "none" || !text) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="letter-manual-empty">
        {loaded.state === "none" && loaded.code !== "LETTER_NOT_VALID"
          ? refusalText(loaded.code)
          : "Gere a carta desta vaga para editar o texto aqui."}
      </p>
    )
  }
  const filled = text.paragraphs.filter((p) => p.trim()).length
  const valid = !!text.subject.trim() && !!text.greeting.trim() && !!text.closing.trim() && filled >= MIN_PARAGRAPHS
  const setParagraph = (index: number, value: string) =>
    setText({ ...text, paragraphs: text.paragraphs.map((p, i) => (i === index ? value : p)) })
  const save = () =>
    startTransition(async () => {
      try {
        const result = await saveLetterManual(jobId, { docSha256: loaded.sha, text })
        if (result.ok) {
          toast.success("Carta enviada ao job-search: o PDF novo sai como -v2, -v3…")
          onStarted()
        } else toastRefusal(result.code)
      } catch {
        toast.error(refusalText("UNAUTHENTICATED"))
      }
    })
  return (
    <div className="space-y-3" role="tabpanel" data-testid="letter-manual">
      <p className="text-xs text-muted-foreground">
        Cabeçalho, data e assinatura são do job-search. Edite o texto; a carta precisa caber em uma página.
      </p>
      <div className="space-y-1">
        <Label htmlFor="letter-subject">Assunto</Label>
        <Input
          id="letter-subject"
          value={text.subject}
          maxLength={120}
          onChange={(event) => setText({ ...text, subject: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="letter-greeting">Saudação</Label>
        <Input
          id="letter-greeting"
          value={text.greeting}
          maxLength={120}
          onChange={(event) => setText({ ...text, greeting: event.target.value })}
        />
      </div>
      {text.paragraphs.map((paragraph, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor={`letter-paragraph-${index}`}>Parágrafo {index + 1}</Label>
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto h-7 w-7"
              aria-label={`Remover o parágrafo ${index + 1}`}
              disabled={text.paragraphs.length <= MIN_PARAGRAPHS}
              onClick={() => setText({ ...text, paragraphs: text.paragraphs.filter((_, i) => i !== index) })}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <Textarea
            id={`letter-paragraph-${index}`}
            value={paragraph}
            maxLength={1200}
            rows={5}
            onChange={(event) => setParagraph(index, event.target.value)}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={text.paragraphs.length >= MAX_PARAGRAPHS}
        data-testid="letter-add-paragraph"
        onClick={() => setText({ ...text, paragraphs: [...text.paragraphs, ""] })}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Parágrafo
      </Button>
      <div className="space-y-1">
        <Label htmlFor="letter-closing">Despedida</Label>
        <Input
          id="letter-closing"
          value={text.closing}
          maxLength={60}
          onChange={(event) => setText({ ...text, closing: event.target.value })}
        />
      </div>
      <Button
        size="sm"
        disabled={!!disabledReason || pending || !valid}
        data-testid="letter-manual-save"
        onClick={save}
      >
        {pending ? "Enviando…" : "Salvar e gerar PDF"}
      </Button>
    </div>
  )
}

function LetterRequest({
  jobId,
  disabledReason,
  onStarted,
}: {
  jobId: string
  disabledReason: string | null
  onStarted: () => void
}) {
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const check = normalizeIntake(text)
  return (
    <div className="space-y-3" role="tabpanel" data-testid="letter-request">
      <Label htmlFor="letter-request-text">O que mudar na carta</Label>
      <Textarea
        id="letter-request-text"
        value={text}
        rows={4}
        placeholder="Ex.: tire o parágrafo sobre o programa rotacional e deixe o fechamento mais curto."
        onChange={(event) => setText(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {intakeLength(text)}/{INTAKE_MAX} · O ChatGPT reescreve a carta inteira com o seu pedido; você lê antes e depois
        e aprova ou descarta antes de gerar o PDF.
      </p>
      <Button
        size="sm"
        disabled={!!disabledReason || pending || !check.ok}
        data-testid="letter-request-submit"
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await requestLetterEdit(jobId, text)
              if (result.ok) {
                toast.success("Pedido enviado ao ChatGPT pelo job-search.")
                setText("")
                onStarted()
              } else toastRefusal(result.code)
            } catch {
              toast.error(refusalText("UNAUTHENTICATED"))
            }
          })
        }
      >
        {pending ? "Enviando…" : "Pedir ao ChatGPT"}
      </Button>
    </div>
  )
}
