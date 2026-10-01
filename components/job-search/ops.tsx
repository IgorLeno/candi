"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Bot,
  CheckCircle2,
  Circle,
  Copy,
  Crosshair,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessagesSquare,
  Radar,
  ScanSearch,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { syncJobSearch } from "@/app/actions/job-search"
import {
  ackDispatch,
  analyzeIntake,
  analyzeJob,
  deleteDispatch,
  discardDispatch,
  listDispatches,
  refineIntake,
  registerWriteset,
  startDispatch,
  startIntake,
} from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { ToneBadge } from "@/components/job-search/tone-badge"
import { formatTimestamp, safeHttpUrl } from "@/lib/job-search/present"
import { INTAKE_MAX, intakeLength, normalizeIntake } from "@/lib/ops/intake"
import { usePlatform, writePlatform } from "@/lib/ops/platform-pref"
import {
  ACTION_META,
  PLATFORM_LABEL,
  statusBadge,
  activeIntake,
  analysisOf,
  analyzeJobBlocker,
  canAnalyzeIntake,
  canDelete,
  canDiscard,
  canRefineIntake,
  canRegisterWriteset,
  discardedIntakes,
  isActiveStatus,
  latest,
  persistSummary,
  refineRoom,
  refusalText,
  withRegistration,
} from "@/lib/ops/present"
import {
  PLATFORMS,
  type BotAction,
  type Dispatch,
  type DispatchAction,
  type DispatchList,
  type DispatchProgress,
  type DispatchStage,
} from "@/lib/ops/schema"
import { cn } from "@/lib/utils"

const ACTION_ICON: Record<DispatchAction, LucideIcon> = {
  BUSCAR_VAGAS: Radar,
  GERAR_CURRICULO: FileText,
  PREENCHER_CANDIDATURA: Bot,
  LOCALIZAR_VAGA: Crosshair,
  ANALISAR_INDICADA: MessagesSquare,
  ANALISAR_VAGA: ScanSearch,
  REGISTRAR_WRITESET: FileSpreadsheet,
}

const POLL_ACTIVE_MS = 5_000

/** Dispatch list for a job or an action; polls while something is running. */
function useDispatches(filter: { jobId?: string; action?: DispatchAction }) {
  const [data, setData] = useState<DispatchList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { jobId, action } = filter
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const result = await listDispatches({ jobId, action })
      if (!alive.current) return
      if (result.ok) {
        setData(result.value)
        setError(null)
      } else {
        setError(result.code)
      }
    } catch {
      if (alive.current) setError("UNAUTHENTICATED")
    }
  }, [jobId, action])

  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
    }
  }, [refresh])

  // A search's writeset persistence runs as its own record; keep polling while it runs too.
  const running = data?.dispatches.some(
    (dispatch) =>
      isActiveStatus(dispatch.status) ||
      (dispatch.progress.registration != null && isActiveStatus(dispatch.progress.registration.status))
  )
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => void refresh(), POLL_ACTIVE_MS)
    return () => window.clearInterval(timer)
  }, [running, refresh])

  return { data, error, refresh }
}

export function PlatformToggle() {
  const platform = usePlatform()
  return (
    <div
      role="radiogroup"
      aria-label="Plataforma dos bots"
      className="inline-flex rounded-full border border-border bg-muted/40 p-0.5"
      data-testid="platform-toggle"
    >
      {PLATFORMS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={platform === option}
          data-testid={`platform-${option}`}
          onClick={() => {
            if (!writePlatform(option)) toast.error("O navegador não permitiu salvar a preferência.")
          }}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
            platform === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {PLATFORM_LABEL[option]}
        </button>
      ))}
    </div>
  )
}

function StageIcon({ stage }: { stage: DispatchStage }) {
  if (stage.state === "done") return <CheckCircle2 className="h-4 w-4 text-st-sent-fg" aria-hidden="true" />
  if (stage.state === "active") return <Loader2 className="h-4 w-4 animate-spin text-st-review-fg" aria-hidden="true" />
  if (stage.state === "failed") return <XCircle className="h-4 w-4 text-st-uncertain-fg" aria-hidden="true" />
  return <Circle className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
}

const STAGE_STATE_LABEL: Record<DispatchStage["state"], string> = {
  done: "concluída",
  active: "em andamento",
  pending: "pendente",
  failed: "interrompida",
}

function CommandBox({ command }: { command: string }) {
  return (
    <div className="space-y-2" data-testid="grok-command">
      <p className="text-xs text-muted-foreground">
        O Grok não tem canal automático: copie o comando e cole no chat do bot no Grok Bot.
      </p>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
        {command}
      </pre>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          navigator.clipboard.writeText(command).then(
            () => toast.success("Comando copiado."),
            () => toast.error("Não foi possível copiar.")
          )
        }
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copiar comando
      </Button>
    </div>
  )
}

/**
 * "Preencher vaga" (2026-09-30): job-search opened the application page in the Application Browser and wrote the
 * prompt; there is no supported way to start Claude in Chrome programmatically, so the user pastes it. The copy
 * happens only on click. Claude in Chrome is NOT covered by the Hermes submit gate: the prompt tells it to stop at
 * READY_TO_SUBMIT and the user clicks the final button.
 */
function ClaudePromptBox({ prompt, url }: { prompt: string; url: string | null | undefined }) {
  return (
    <div className="space-y-2" data-testid="claude-prompt">
      <p className="text-xs text-muted-foreground">
        Página aberta{url ? " no Application Browser" : ""}. Cole este prompt no Claude in Chrome (painel do Claude na
        aba da vaga). O Claude para em READY_TO_SUBMIT: o envio final é sempre seu.
      </p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
        {prompt}
      </pre>
      <Button
        size="sm"
        onClick={() =>
          navigator.clipboard.writeText(prompt).then(
            () => toast.success("Prompt copiado. Cole no Claude in Chrome."),
            () => toast.error("Não foi possível copiar.")
          )
        }
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        COPIAR PROMPT PARA CLAUDE
      </Button>
    </div>
  )
}

/**
 * Writeset of a finished search: "Registrar na planilha" asks job-search to persist it (the panel has no write
 * credential). When the persistence this card watched finishes, the Sheet snapshot is read again.
 */
function WritesetRegistration({
  dispatch,
  progress,
  onChanged,
}: {
  dispatch: Dispatch
  progress: DispatchProgress
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [syncing, startSync] = useTransition()
  const router = useRouter()
  const registration = progress.registration ?? null
  const status = registration?.status
  const previous = useRef(status)

  useEffect(() => {
    const before = previous.current
    previous.current = status
    if (!before || !isActiveStatus(before) || status !== "CONCLUIDO") return
    startSync(async () => {
      try {
        await syncJobSearch()
        router.refresh()
        toast.success("Writeset gravado pelo job-search; planilha relida.")
      } catch {
        toast.error("Writeset gravado, mas não foi possível sincronizar. Clique em Sincronizar.")
      }
    })
  }, [status, router])

  if (!progress.writeset_path) return null
  const count = progress.writeset_job_ids?.length ?? 0
  const running = status !== undefined && isActiveStatus(status)
  const summary = status === "CONCLUIDO" ? persistSummary(registration?.result) : null
  return (
    <div className="space-y-2" data-testid="writeset-registration" data-registration={status ?? "none"}>
      <p className="text-xs text-muted-foreground">
        Writeset em <span className="font-mono">{progress.writeset_path}</span>
        {summary
          ? `: gravado pelo job-search (${summary}).`
          : running
            ? ": o job-search está gravando na planilha."
            : ", pendente de persistência."}
        {syncing && " Relendo a planilha…"}
      </p>
      {canRegisterWriteset(progress) && (
        <Button size="sm" variant="outline" data-testid="register-writeset" onClick={() => setOpen(true)}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          {ACTION_META.REGISTRAR_WRITESET.verb}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="register-dialog">
          <DialogHeader>
            <DialogTitle>{ACTION_META.REGISTRAR_WRITESET.label}</DialogTitle>
            <DialogDescription>{ACTION_META.REGISTRAR_WRITESET.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              O job-search vai gravar{" "}
              <strong>
                {count} {count === 1 ? "vaga" : "vagas"}
              </strong>{" "}
              na planilha com a credencial de escrita dele: UPSERT por job_id com releitura, mais as linhas de Dossiers
              e Cobertura de Fontes do writeset.
            </p>
            <p className="text-xs text-muted-foreground">
              Writeset <span className="font-mono">{progress.writeset_path}</span>. Depois de gravado, o painel relê a
              planilha.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="register-cancel">
              Cancelar
            </Button>
            <Button
              disabled={pending}
              data-testid="register-confirm"
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await registerWriteset(dispatch.id)
                    if (!result.ok) {
                      toast.error(refusalText(result.code))
                      return
                    }
                    toast.success("Gravação pedida ao job-search.")
                    setOpen(false)
                    onChanged()
                  } catch {
                    toast.error(refusalText("UNAUTHENTICATED"))
                  }
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Gravar {count} {count === 1 ? "vaga" : "vagas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * "Vaga indicada": what the user typed and what the Lince found. All of it is untrusted text (user input, job
 * posting fields): rendered as text, the link only through `safeHttpUrl`. The diagnosis is `writeset.py rows`.
 */
function IntakeDetails({ progress, analysis }: { progress: DispatchProgress; analysis: boolean }) {
  // The analysis card sits next to its intake card: it only names the job and adds the diagnosis.
  const result = progress.intake ?? null
  const job = result?.found ? result.job : null
  const href = safeHttpUrl(job?.url)
  const prefilter = analysis ? null : (result?.prefilter ?? null)
  const blocked = prefilter?.verdict === "BLOQUEIO_GRAVE"
  return (
    <div className="space-y-2 text-sm" data-testid="intake-details">
      {progress.intake_text && !analysis && (
        <p
          className="line-clamp-3 rounded-lg border border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap text-muted-foreground"
          title={progress.intake_text}
          data-testid="intake-text"
        >
          {progress.intake_text}
        </p>
      )}
      {result && !result.found && (
        <p className="text-xs" data-testid="intake-reason">
          Não localizada{result.reason ? `: ${result.reason}` : ""}.
        </p>
      )}
      {job && (
        <div className="space-y-1" data-testid="intake-job">
          <p>
            <span className="font-semibold text-foreground">{job.title}</span>
            {job.company && <> · {job.company}</>}
            {job.location && <span className="text-muted-foreground"> · {job.location}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {job.source && <span>Fonte: {job.source}</span>}
            {href && (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                data-testid="intake-link"
              >
                Abrir a vaga
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </p>
        </div>
      )}
      {prefilter && (
        <div className="space-y-1" data-testid="intake-prefilter" data-verdict={prefilter.verdict}>
          <ToneBadge tone={blocked ? "warning" : "good"}>
            {blocked ? "Prefilter: bloqueio grave" : "Prefilter: passa"}
          </ToneBadge>
          {prefilter.reasons.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {prefilter.reasons.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          )}
          {blocked && (
            <p className="text-xs text-muted-foreground">O bloqueio não impede a análise no ChatGPT: você decide.</p>
          )}
        </div>
      )}
      {result?.already_in_registry && !analysis && (
        <p
          className="rounded-lg border border-st-review/45 bg-st-review/15 p-2 text-xs text-st-review-fg"
          role="note"
          data-testid="intake-in-registry"
        >
          Esta vaga já está na planilha: registrar de novo atualiza a linha dela.
        </p>
      )}
      <DiagnosisList progress={progress} testId="intake-diagnosis" />
    </div>
  )
}

const DIAGNOSIS_BY: Record<string, string> = {
  chatgpt: "Diagnóstico do ChatGPT",
  threadgist: "Diagnóstico do Threadgist (sem prova de uso do ChatGPT)",
}

/**
 * The verdict and its reason as `writeset.py rows` has them (never recomputed here). Only the dispatcher says who
 * produced it; without that the label names no one. The reason is untrusted text: rendered as text only.
 */
function DiagnosisList({ progress, testId }: { progress: DispatchProgress; testId: string }) {
  const diagnosis = progress.diagnosis ?? []
  if (diagnosis.length === 0) return null
  const label = DIAGNOSIS_BY[progress.diagnosis_by ?? ""] ?? "Diagnóstico"
  return (
    <ul className="space-y-1" data-testid={testId}>
      {diagnosis.map((row, index) => (
        <li key={index} className="text-sm">
          <span className="text-muted-foreground">{label}: </span>
          <span className="font-mono font-semibold">{row.status_analise || "sem status"}</span>
          {row.interesse && <span className="text-muted-foreground"> · interesse {row.interesse}</span>}
          {row.motivo_analise && (
            <p className="mt-0.5 text-xs whitespace-pre-wrap text-muted-foreground" data-testid="diagnosis-reason">
              {row.motivo_analise}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * NEEDS_CONTEXT: pick one of the Lince's candidates or, always last, "Outro" with free text. Either one becomes a
 * complement of the original indication and the Lince runs again; the candidate goes only as its number. The
 * candidates are untrusted text from the Lince: rendered as text, links only through `safeHttpUrl`.
 */
function IntakeRefine({ dispatch, onChanged }: { dispatch: Dispatch; onChanged: () => void }) {
  const candidates = dispatch.progress.intake?.candidates ?? []
  const [choice, setChoice] = useState<number | "outro" | null>(candidates.length === 0 ? "outro" : null)
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const room = refineRoom(dispatch.progress.intake_text)
  const other = choice === "outro"
  const check = normalizeIntake(text)
  const length = intakeLength(text.trim())
  const problem =
    !other || text.trim().length === 0
      ? null
      : length > room
        ? refusalText("INTAKE_TOO_LONG")
        : check.ok
          ? null
          : refusalText(check.code)
  const ready = choice !== null && (!other || (check.ok && length <= room))
  const name = `intake-refine-${dispatch.id}`

  const submit = () =>
    startTransition(async () => {
      try {
        const result = await refineIntake(dispatch.id, other ? { text } : { candidate: choice })
        if (!result.ok) {
          toast.error(refusalText(result.code))
          return
        }
        toast.success(`${result.value.bot} procurando de novo, com o complemento.`)
        onChanged()
      } catch {
        toast.error(refusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3 text-sm" data-testid="intake-refine">
      <legend className="px-1 text-xs font-semibold text-foreground">
        {candidates.length > 0 ? "Qual destas é a vaga?" : "Acrescentar mais informações"}
      </legend>
      {candidates.map((candidate, index) => {
        const href = safeHttpUrl(candidate.url)
        return (
          <label key={index} className="flex items-start gap-2" data-testid="intake-candidate">
            <input
              type="radio"
              name={name}
              className="mt-1 accent-primary"
              checked={choice === index + 1}
              onChange={() => setChoice(index + 1)}
            />
            <span>
              <span className="font-semibold text-foreground">{candidate.title}</span>
              {candidate.company && <> · {candidate.company}</>}
              {candidate.location && <span className="text-muted-foreground"> · {candidate.location}</span>}
              {candidate.source && <span className="text-xs text-muted-foreground"> · {candidate.source}</span>}
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  data-testid="intake-candidate-link"
                >
                  Abrir
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </span>
          </label>
        )
      })}
      {candidates.length > 0 && (
        <label className="flex items-start gap-2" data-testid="intake-candidate-other">
          <input
            type="radio"
            name={name}
            className="mt-1 accent-primary"
            checked={other}
            onChange={() => setChoice("outro")}
          />
          <span>Outro</span>
        </label>
      )}
      {other && (
        <div className="space-y-1">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ex.: a vaga é de engenheiro químico, efetivo."
            rows={3}
            aria-label="Acrescentar mais informações"
            aria-describedby={`${name}-hint`}
            aria-invalid={problem !== null}
            data-testid="intake-refine-input"
          />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" id={`${name}-hint`}>
            <span data-testid="intake-refine-problem" className={cn(problem && "text-st-uncertain-fg")}>
              {problem ?? "Vai junto com a indicação original, como dado para o Lince."}
            </span>
            <span className="tabular-nums" data-testid="intake-refine-count">
              {length}/{room}
            </span>
          </div>
        </div>
      )}
      <Button size="sm" disabled={!ready || pending} data-testid="intake-refine-submit" onClick={submit}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Localizar de novo
      </Button>
    </fieldset>
  )
}

/** "Mandar para o ChatGPT" (located intake) and "Descartar" (panel only), each behind a confirmation. */
function IntakeDecisions({
  dispatch,
  analysis,
  onChanged,
}: {
  dispatch: Dispatch
  analysis: Dispatch | null
  onChanged: () => void
}) {
  const [confirm, setConfirm] = useState<"analyze" | "discard" | null>(null)
  const [pending, startTransition] = useTransition()
  const analyze = dispatch.action === "LOCALIZAR_VAGA" && canAnalyzeIntake(dispatch, analysis)
  // Once an analysis exists, the decision (register or discard) lives on its card.
  const decidedOnAnalysis = dispatch.action === "LOCALIZAR_VAGA" && analysis && !analysis.discarded
  const discard = canDiscard(dispatch) && !decidedOnAnalysis
  const remove = canDelete(dispatch) && !decidedOnAnalysis
  if (!analyze && !discard && !remove) return null
  const blocked = dispatch.progress.intake?.prefilter?.verdict === "BLOQUEIO_GRAVE"

  const run = (kind: "analyze" | "discard") =>
    startTransition(async () => {
      try {
        const result = kind === "analyze" ? await analyzeIntake(dispatch.id) : await discardDispatch(dispatch.id)
        if (!result.ok) {
          toast.error(refusalText(result.code))
          return
        }
        toast.success(
          kind === "analyze" ? "Análise no ChatGPT iniciada." : "Vaga indicada descartada. Nada foi para a planilha."
        )
        setConfirm(null)
        onChanged()
      } catch {
        toast.error(refusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <div className="flex flex-wrap gap-2">
      {analyze && (
        <Button size="sm" data-testid="intake-analyze" onClick={() => setConfirm("analyze")}>
          <MessagesSquare className="h-4 w-4" aria-hidden="true" />
          {ACTION_META.ANALISAR_INDICADA.verb}
        </Button>
      )}
      {discard && (
        <Button size="sm" variant="outline" data-testid="intake-discard" onClick={() => setConfirm("discard")}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Descartar
        </Button>
      )}
      {remove && <DeleteIntakeButton dispatch={dispatch} onChanged={onChanged} />}
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent data-testid="intake-decision-dialog">
          <DialogHeader>
            <DialogTitle>
              {confirm === "analyze" ? ACTION_META.ANALISAR_INDICADA.label : "Descartar a vaga indicada"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "analyze"
                ? ACTION_META.ANALISAR_INDICADA.description
                : "Ela sai do acompanhamento do painel. Nada vai para a planilha e nenhum bot é acionado."}
            </DialogDescription>
          </DialogHeader>
          {confirm === "analyze" && (
            <div className="space-y-2 text-sm">
              {blocked && (
                <p className="rounded-lg border border-st-review/45 bg-st-review/15 p-2 text-st-review-fg" role="note">
                  O prefilter apontou bloqueio grave. A análise roda mesmo assim, porque a decisão é sua.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Roda pelo Hermes. Nada é gravado na planilha sem o seu &ldquo;Registrar na planilha&rdquo;.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} data-testid="intake-decision-cancel">
              Cancelar
            </Button>
            <Button
              variant={confirm === "discard" ? "destructive" : "default"}
              disabled={pending}
              data-testid="intake-decision-confirm"
              onClick={() => confirm && run(confirm)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {confirm === "discard" ? "Descartar" : "Acionar Hermes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** "Excluir": the intake leaves the panel for good (local dispatch records only, nothing goes to the Sheet). */
function DeleteIntakeButton({ dispatch, onChanged }: { dispatch: Dispatch; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const run = () =>
    startTransition(async () => {
      try {
        const result = await deleteDispatch(dispatch.id)
        if (!result.ok) {
          toast.error(refusalText(result.code))
          return
        }
        toast.success("Vaga indicada excluída do painel. Nada foi para a planilha.")
        setOpen(false)
        onChanged()
      } catch {
        toast.error(refusalText("UNAUTHENTICATED"))
      }
    })
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        data-testid="intake-delete"
        onClick={() => setOpen(true)}
      >
        <XCircle className="h-4 w-4" aria-hidden="true" />
        Excluir
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="intake-delete-dialog">
          <DialogHeader>
            <DialogTitle>Excluir a vaga indicada</DialogTitle>
            <DialogDescription>
              Ela some do painel, junto com as análises e os complementos dela. Nada vai para a planilha e não dá para
              desfazer pelo painel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="intake-delete-cancel">
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pending} data-testid="intake-delete-confirm" onClick={run}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Discarded intakes, collapsed under the active card: what was indicated and when, plus "Excluir". */
function DiscardedIntakes({ intakes, onChanged }: { intakes: Dispatch[]; onChanged: () => void }) {
  if (intakes.length === 0) return null
  return (
    <details className="rounded-xl border border-border p-3 text-sm" data-testid="intake-discarded-list">
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
        Indicações descartadas · {intakes.length}
      </summary>
      <ul className="mt-2 space-y-2">
        {intakes.map((dispatch) => {
          const job = dispatch.progress.intake?.found ? dispatch.progress.intake.job : null
          const text = dispatch.progress.intake_text
          return (
            <li key={dispatch.id} className="flex items-start gap-2" data-testid="intake-discarded-item">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="line-clamp-2 text-xs whitespace-pre-wrap" title={text ?? undefined}>
                  {job ? `${job.title}${job.company ? ` · ${job.company}` : ""}` : (text ?? "Vaga indicada")}
                </p>
                <p className="text-xs text-muted-foreground">{formatTimestamp(dispatch.created_at)}</p>
              </div>
              {canDelete(dispatch) && <DeleteIntakeButton dispatch={dispatch} onChanged={onChanged} />}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

const ACKABLE = new Set(["INCERTO", "FALHOU", "PRECISA_HUMANO", "PARADO", "MANUAL"])

export function DispatchCard({
  dispatch,
  knownJobIds,
  analysis = null,
  onChanged,
}: {
  dispatch: Dispatch
  knownJobIds?: ReadonlySet<string>
  /** LOCALIZAR_VAGA: the latest analysis of this intake, if any. */
  analysis?: Dispatch | null
  onChanged: () => void
}) {
  const intake = dispatch.action === "LOCALIZAR_VAGA" || dispatch.action === "ANALISAR_INDICADA"
  const [pending, startTransition] = useTransition()
  const progress =
    dispatch.action === "BUSCAR_VAGAS" && knownJobIds
      ? withRegistration(dispatch.progress, knownJobIds)
      : dispatch.progress
  const status = statusBadge(dispatch.status, progress)
  const Icon = ACTION_ICON[dispatch.action]
  return (
    <div
      className="space-y-3 rounded-2xl border border-border bg-card/60 p-4"
      data-testid={`dispatch-${dispatch.action}`}
      data-status={dispatch.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">{ACTION_META[dispatch.action].label}</span>
        <span className="text-xs text-muted-foreground">
          {dispatch.bot} · {PLATFORM_LABEL[dispatch.platform]} · {formatTimestamp(dispatch.created_at)}
        </span>
        <ToneBadge
          tone={status.tone}
          className="ml-auto"
          data-testid="dispatch-status"
          data-recovered={status.recovered || undefined}
        >
          {status.label}
        </ToneBadge>
        {dispatch.discarded && (
          <ToneBadge tone="muted" data-testid="dispatch-discarded">
            Descartada
          </ToneBadge>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Progress
          value={progress.percent}
          aria-label={`Progresso: ${progress.percent}%`}
          className="h-2.5 bg-muted"
          data-testid="dispatch-progress"
        />
        <span className="w-10 text-right font-display text-sm font-bold tabular-nums">{progress.percent}%</span>
      </div>
      <ol className="space-y-1.5">
        {progress.stages.map((stage) => (
          <li
            key={stage.key}
            className="flex items-start gap-2 text-sm"
            data-stage={stage.key}
            data-state={stage.state}
          >
            <StageIcon stage={stage} />
            <span className={cn(stage.state === "pending" && "text-muted-foreground")}>
              {stage.label}
              <span className="sr-only"> ({STAGE_STATE_LABEL[stage.state]})</span>
              {stage.note && <span className="ml-1.5 text-xs text-muted-foreground">— {stage.note}</span>}
            </span>
          </li>
        ))}
      </ol>
      {intake && <IntakeDetails progress={progress} analysis={dispatch.action === "ANALISAR_INDICADA"} />}
      {dispatch.refines && (
        <p className="text-xs text-muted-foreground" data-testid="intake-refines">
          Complementa uma indicação que o Lince não conseguiu localizar.
        </p>
      )}
      {canRefineIntake(dispatch) && <IntakeRefine key={dispatch.id} dispatch={dispatch} onChanged={onChanged} />}
      {dispatch.action === "ANALISAR_VAGA" && <DiagnosisList progress={progress} testId="analysis-diagnosis" />}
      {(dispatch.action === "BUSCAR_VAGAS" ||
        dispatch.action === "ANALISAR_VAGA" ||
        (dispatch.action === "ANALISAR_INDICADA" && !dispatch.discarded)) && (
        <WritesetRegistration dispatch={dispatch} progress={progress} onChanged={onChanged} />
      )}
      {intake && <IntakeDecisions dispatch={dispatch} analysis={analysis} onChanged={onChanged} />}
      {(dispatch.code || dispatch.marker) && dispatch.status !== "CONCLUIDO" && (
        <p className="text-xs text-muted-foreground">
          Código: <span className="font-mono">{dispatch.code ?? dispatch.marker}</span>
          {dispatch.status === "PRECISA_HUMANO" &&
            (dispatch.mode === "host"
              ? dispatch.code === "PASTE_PROMPT_IN_CLAUDE"
                ? " — cole o prompt abaixo no Claude in Chrome."
                : dispatch.code === "POSTING_UNAVAILABLE"
                  ? " — o job-search não achou o texto desta vaga (sem publicação salva, sem dossier anterior e fora do LinkedIn)."
                  : " — ação sua necessária (veja o código)."
              : canRefineIntake(dispatch)
                ? " — escolha a vaga acima ou acrescente informações em \u201cOutro\u201d."
                : " — veja o Bot Chat no Hermes Desktop.")}
          {status.recovered && " — a análise foi refeita fora deste disparo e o writeset foi gravado na planilha."}
          {dispatch.status === "INCERTO" &&
            (dispatch.mode === "host"
              ? " — o processo do job-search caiu; confira o runtime antes de liberar um novo disparo."
              : " — o acompanhamento caiu; confira o Bot Chat no Hermes Desktop antes de liberar um novo disparo.")}
        </p>
      )}
      {dispatch.command && <CommandBox command={dispatch.command} />}
      {progress.claude_prompt && <ClaudePromptBox prompt={progress.claude_prompt} url={progress.claude_url} />}
      {ACKABLE.has(dispatch.status) && !dispatch.acknowledged && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          data-testid="dispatch-ack"
          onClick={() =>
            startTransition(async () => {
              const result = await ackDispatch(dispatch.id)
              if (result.ok) onChanged()
              else toast.error(refusalText(result.code))
            })
          }
        >
          {dispatch.status === "INCERTO" ? "Conferi no Desktop, liberar" : "Dispensar"}
        </Button>
      )}
    </div>
  )
}

function DispatchButton({
  action,
  jobId,
  disabledReason,
  warning,
  primary,
  onStarted,
}: {
  action: BotAction
  jobId?: string
  disabledReason: string | null
  warning?: string | null
  primary?: boolean
  onStarted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [command, setCommand] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const platform = usePlatform()
  const meta = ACTION_META[action]
  const Icon = ACTION_ICON[action]

  return (
    <>
      <Button
        variant={primary ? "default" : "outline"}
        size="sm"
        disabled={disabledReason !== null}
        title={disabledReason ?? undefined}
        data-testid={`dispatch-button-${action}`}
        onClick={() => {
          setCommand(null)
          setOpen(true)
        }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {meta.verb}
      </Button>
      {disabledReason && (
        <span className="sr-only" data-testid={`dispatch-disabled-${action}`}>
          {disabledReason}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dispatch-dialog">
          <DialogHeader>
            <DialogTitle>{meta.label}</DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          {command ? (
            <CommandBox command={command} />
          ) : (
            <div className="space-y-3 text-sm">
              {jobId && (
                <p>
                  Vaga <span className="font-mono">{jobId}</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Plataforma:</span>
                <PlatformToggle />
              </div>
              {warning && (
                <p className="rounded-lg border border-st-review/45 bg-st-review/15 p-2 text-st-review-fg" role="note">
                  {warning}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Nenhuma candidatura é enviada: SUBMIT desligado no job-search e o bot para antes do botão final.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="dispatch-cancel">
              {command ? "Fechar" : "Cancelar"}
            </Button>
            {!command && (
              <Button
                disabled={pending}
                data-testid="dispatch-confirm"
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await startDispatch({ action, platform, ...(jobId ? { jobId } : {}) })
                      if (!result.ok) {
                        toast.error(refusalText(result.code))
                        return
                      }
                      onStarted()
                      if (result.value.command) {
                        setCommand(result.value.command)
                      } else {
                        toast.success(`${result.value.bot} acionado.`)
                        setOpen(false)
                      }
                    } catch {
                      toast.error(refusalText("UNAUTHENTICATED"))
                    }
                  })
                }
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Acionar {PLATFORM_LABEL[platform]}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * "Indicar vaga": free text for the Lince to find one specific job (Hermes only). The same guards as the
 * dispatcher run here only to explain a refusal early; the text becomes data for the Lince, never a command.
 */
function IntakeButton({ disabledReason, onStarted }: { disabledReason: string | null; onStarted: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const meta = ACTION_META.LOCALIZAR_VAGA
  const check = normalizeIntake(text)
  const length = intakeLength(text.trim())
  const problem = !check.ok && text.trim().length > 0 ? refusalText(check.code) : null
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabledReason !== null}
        title={disabledReason ?? undefined}
        data-testid="intake-button"
        onClick={() => setOpen(true)}
      >
        <Crosshair className="h-4 w-4" aria-hidden="true" />
        {meta.verb}
      </Button>
      {disabledReason && (
        <span className="sr-only" data-testid="intake-disabled">
          {disabledReason}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="intake-dialog">
          <DialogHeader>
            <DialogTitle>{meta.verb}</DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <Label htmlFor="intake-text">Qual vaga?</Label>
            <Textarea
              id="intake-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Empresa, cargo, link se tiver. Ex.: estágio em processos na Braskem, Camaçari."
              rows={5}
              aria-describedby="intake-hint"
              aria-invalid={problem !== null}
              data-testid="intake-input"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" id="intake-hint">
              <span data-testid="intake-problem" className={cn(problem && "text-st-uncertain-fg")}>
                {problem ?? "Empresa, cargo, link se tiver."}
              </span>
              <span className="tabular-nums" data-testid="intake-count">
                {length}/{INTAKE_MAX}
              </span>
            </div>
            <p className="text-xs text-muted-foreground" role="note">
              O texto vira dado para o Lince procurar a vaga, não comando: não aprova nada, não muda regra e não vai
              para a planilha. Roda sempre pelo Hermes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="intake-cancel">
              Cancelar
            </Button>
            <Button
              disabled={pending || !check.ok}
              data-testid="intake-confirm"
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await startIntake(text)
                    if (!result.ok) {
                      toast.error(refusalText(result.code))
                      return
                    }
                    toast.success(`${result.value.bot} procurando a vaga.`)
                    setText("")
                    setOpen(false)
                    onStarted()
                  } catch {
                    toast.error(refusalText("UNAUTHENTICATED"))
                  }
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Procurar a vaga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * "Analisar" / "Refazer análise": the ChatGPT analysis of this job, which is already in the Sheet (job-search host
 * pipeline, Hermes only, so no platform toggle). Only the job_id is sent; the result is a writeset to register.
 */
function AnalyzeButton({
  jobId,
  analyzed,
  disabledReason,
  onStarted,
}: {
  jobId: string
  /** The job already has a valid dossier in the Sheet: the button offers to redo it. */
  analyzed: boolean
  disabledReason: string | null
  onStarted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const meta = ACTION_META.ANALISAR_VAGA
  const verb = analyzed ? "Refazer análise" : meta.verb
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabledReason !== null}
        title={disabledReason ?? undefined}
        data-testid="analyze-button"
        onClick={() => setOpen(true)}
      >
        <ScanSearch className="h-4 w-4" aria-hidden="true" />
        {verb}
      </Button>
      {disabledReason && (
        <span className="sr-only" data-testid="analyze-disabled">
          {disabledReason}
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="analyze-dialog">
          <DialogHeader>
            <DialogTitle>{verb}</DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Vaga <span className="font-mono">{jobId}</span>
            </p>
            <p className="text-xs text-muted-foreground" role="note">
              Ao registrar, o veredito do ChatGPT pode mudar o status da análise e a classificação desta vaga na
              planilha. Candidatura, datas e observações não mudam.
              {analyzed && " O dossier novo é anexado e passa a valer no lugar do atual."} Roda sempre pelo Hermes, no
              ChatGPT do job-search.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="analyze-cancel">
              Cancelar
            </Button>
            <Button
              disabled={pending}
              data-testid="analyze-confirm"
              onClick={() =>
                startTransition(async () => {
                  try {
                    const result = await analyzeJob(jobId)
                    if (!result.ok) {
                      toast.error(refusalText(result.code))
                      return
                    }
                    toast.success("Análise pedida ao job-search.")
                    setOpen(false)
                    onStarted()
                  } catch {
                    toast.error(refusalText("UNAUTHENTICATED"))
                  }
                })
              }
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Analisar no ChatGPT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function gatewayReason(data: DispatchList | null, platform: string): string | null {
  if (platform !== "hermes" || !data || data.gateway === "running") return null
  return "Gateway Hermes parado ou sem inferência. Inicie-o ou troque para Grok."
}

/** "Buscar vagas" and "Indicar vaga" plus the latest search and intake progress (Hoje and /vagas). */
export function SearchOps({ knownJobIds }: { knownJobIds: string[] }) {
  const { data, error, refresh } = useDispatches({ action: "BUSCAR_VAGAS" })
  const intakes = useDispatches({ action: "LOCALIZAR_VAGA" })
  const analyses = useDispatches({ action: "ANALISAR_INDICADA" })
  const { refresh: refreshIntakes } = intakes
  const { refresh: refreshAnalyses } = analyses
  const refreshAll = useCallback(() => {
    void refresh()
    void refreshIntakes()
    void refreshAnalyses()
  }, [refresh, refreshIntakes, refreshAnalyses])
  const known = useMemo(() => new Set(knownJobIds), [knownJobIds])
  const last = data ? latest(data.dispatches, "BUSCAR_VAGAS") : null
  const intake = intakes.data ? activeIntake(intakes.data.dispatches) : null
  const discarded = intakes.data ? discardedIntakes(intakes.data.dispatches) : []
  const analysis = intake && analyses.data ? analysisOf(analyses.data.dispatches, intake.id) : null
  // Search and intake share the Lince's Bot Chat: one at a time (the dispatcher refuses with PROFILE_BUSY). The
  // intake analysis runs on the host and does not hold the Lince, but it holds the ChatGPT the search also uses.
  const linceBusy = [last, intake].some((dispatch) => dispatch?.active)
    ? "O Lince já está com um disparo em andamento."
    : null
  const chatgptBusy = (analyses.data?.dispatches ?? []).some((dispatch) => dispatch.active)
    ? "A análise da vaga indicada está usando o ChatGPT."
    : null
  const reason = (last?.active ? "Já existe uma busca em andamento." : null) ?? linceBusy ?? chatgptBusy
  const intakeReason = linceBusy ?? gatewayReason(data, "hermes")
  const shownError = error ?? intakes.error ?? analyses.error
  return (
    <section className="space-y-3" data-testid="search-ops" aria-label="Busca de vagas pelos bots">
      <div className="flex flex-wrap items-center gap-2">
        <DispatchButton action="BUSCAR_VAGAS" disabledReason={reason} primary onStarted={refreshAll} />
        <IntakeButton disabledReason={intakeReason} onStarted={refreshAll} />
        {shownError && <span className="text-xs text-muted-foreground">{refusalText(shownError)}</span>}
      </div>
      {last && <DispatchCard dispatch={last} knownJobIds={known} onChanged={refreshAll} />}
      {intake && (
        <div className="grid gap-3 lg:grid-cols-2" data-testid="intake-ops">
          <DispatchCard dispatch={intake} analysis={analysis} onChanged={refreshAll} />
          {analysis && <DispatchCard dispatch={analysis} onChanged={refreshAll} />}
        </div>
      )}
      <DiscardedIntakes intakes={discarded} onChanged={refreshAll} />
    </section>
  )
}

/** Bot actions of one job: "Analisar", "Gerar currículo", then "Preencher candidatura". */
export function JobOps({
  jobId,
  blocker,
  analyzed,
}: {
  jobId: string
  /** Blocks résumé and application only: "Analisar" works on any job in the Sheet, sent ones included. */
  blocker: string | null
  analyzed: boolean
}) {
  const { data, error, refresh } = useDispatches({ jobId })
  const analysis = latest(data?.dispatches ?? [], "ANALISAR_VAGA")
  const cv = latest(data?.dispatches ?? [], "GERAR_CURRICULO")
  const application = latest(data?.dispatches ?? [], "PREENCHER_CANDIDATURA")
  const job = data?.job
  const base =
    blocker ?? (job && !job.actionable ? "Sem dossier válido (SELECIONADA e ABERTA) no runtime do job-search." : null)
  const cvReady = job?.cv === "VALID"
  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4"
      data-testid="job-ops"
      aria-label="Operação dos bots nesta vaga"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bots</span>
        <AnalyzeButton
          jobId={jobId}
          analyzed={analyzed}
          disabledReason={analyzeJobBlocker(analysis)}
          onStarted={refresh}
        />
        <DispatchButton
          action="GERAR_CURRICULO"
          jobId={jobId}
          disabledReason={base ?? (cv?.active ? "Geração de currículo em andamento." : null)}
          onStarted={refresh}
        />
        <DispatchButton
          action="PREENCHER_CANDIDATURA"
          jobId={jobId}
          primary
          disabledReason={base ?? (application?.active ? "Candidatura em andamento." : null)}
          warning={cvReady ? null : "O currículo desta vaga ainda não está pronto. O recomendado é gerar antes."}
          onStarted={refresh}
        />
        {job && (
          <ToneBadge tone={cvReady ? "good" : "muted"} className="ml-auto" data-testid="cv-status">
            {cvReady ? "Currículo pronto" : "Currículo não gerado"}
          </ToneBadge>
        )}
      </div>
      {error && <p className="text-xs text-muted-foreground">{refusalText(error)}</p>}
      {base && <p className="text-xs text-muted-foreground">{base}</p>}
      {(analysis || cv || application) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {analysis && <DispatchCard dispatch={analysis} onChanged={refresh} />}
          {cv && <DispatchCard dispatch={cv} onChanged={refresh} />}
          {application && <DispatchCard dispatch={application} onChanged={refresh} />}
        </div>
      )}
    </section>
  )
}
