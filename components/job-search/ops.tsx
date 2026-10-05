"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  AppWindow,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessagesSquare,
  PencilLine,
  Radar,
  ScanSearch,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { syncJobSearch } from "@/app/actions/job-search"
import {
  ackDispatch,
  analyzeIntake,
  analyzeJob,
  analyzeLeftOut,
  deleteDispatch,
  editCv,
  discardDispatch,
  getCvFile,
  listDispatches,
  openApplicationBrowser,
  openCvBrowser,
  refineIntake,
  registerWriteset,
  resumeCv,
  startDispatch,
  startIntake,
} from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { useClosed, useCollapsed, writeClosed, writeCollapsed } from "@/lib/ops/collapse-pref"
import {
  applicationStopText,
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
  canResumeCv,
  cvFileText,
  discardedIntakes,
  isActiveStatus,
  latest,
  leftOutBlocker,
  leftOutKindLabel,
  needsUser,
  persistSummary,
  refineRoom,
  refusalText,
  resumeCvRefusalText,
  searchVerb,
  withRegistration,
} from "@/lib/ops/present"
import {
  CV_EDIT_ACTION,
  LEFT_OUT_ACTION,
  PLATFORMS,
  type BotAction,
  type CvFileInfo,
  type CvResumeOption,
  type Dispatch,
  type DispatchAction,
  type DispatchList,
  type DispatchProgress,
  type DispatchStage,
  type OpenBrowserResult,
} from "@/lib/ops/schema"
import { cn } from "@/lib/utils"

const ACTION_ICON: Record<DispatchAction, LucideIcon> = {
  BUSCAR_VAGAS: Radar,
  GERAR_CURRICULO: FileText,
  PREENCHER_CANDIDATURA: Bot,
  LOCALIZAR_VAGA: Crosshair,
  ANALISAR_INDICADA: MessagesSquare,
  ANALISAR_VAGA: ScanSearch,
  ANALISAR_DESCOBERTA: ScanSearch,
  EDITAR_CURRICULO: PencilLine,
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
function ClaudePromptBox({
  prompt,
  url,
  stale,
}: {
  prompt: string
  url: string | null | undefined
  /** The résumé changed after this prompt was prepared: pasting it would attach the old PDF. */
  stale: boolean
}) {
  if (stale) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-st-review/60 bg-st-review/10 p-3 text-sm text-st-review-fg"
        data-testid="claude-prompt-stale"
      >
        O currículo desta vaga mudou depois que este prompt foi preparado: ele anexaria o PDF antigo. Clique em
        “Preencher vaga” de novo para um prompt com o currículo atual.
      </p>
    )
  }
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
              {problem ?? "Vai junto com a descrição original, como dado para o Lince."}
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

/**
 * "Gerar currículo" stuck on the user: job-search's reason, the Claude panel's own reason and reply, the ChatGPT
 * doubts, then the options job-search offers and, always last, "Outro" with free text (a new ChatGPT patch with the
 * user's note). All of it is untrusted text from job-search and the bots: rendered as text, never as HTML.
 */
function CvResume({ dispatch, onChanged }: { dispatch: Dispatch; onChanged: () => void }) {
  const recovery = dispatch.progress.recovery
  const [choice, setChoice] = useState<CvResumeOption | "outro" | null>(null)
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  if (!recovery) return null
  const other = choice === "outro"
  const check = normalizeIntake(text)
  const length = intakeLength(text.trim())
  const problem = !other || text.trim().length === 0 ? null : check.ok ? null : resumeCvRefusalText(check.code)
  const ready = choice !== null && (!other || check.ok)
  const name = `cv-resume-${dispatch.id}`

  const submit = () =>
    startTransition(async () => {
      try {
        const result = await resumeCv(dispatch.id, other ? { note: text } : { option: choice })
        if (!result.ok) {
          toast.error(resumeCvRefusalText(result.code))
          return
        }
        toast.success("Currículo retomado: acompanhe o card novo.")
        onChanged()
      } catch {
        toast.error(refusalText("UNAUTHENTICATED"))
      }
    })

  return (
    <div className="space-y-3 rounded-lg border border-border p-3 text-sm" data-testid="cv-recovery">
      <p className="text-foreground" data-testid="cv-recovery-reason">
        {recovery.reason}
      </p>
      {recovery.claude_reason && (
        <p data-testid="cv-recovery-claude-reason">
          <span className="font-semibold text-foreground">Motivo informado pelo Claude:</span> {recovery.claude_reason}
        </p>
      )}
      {recovery.claude_reply && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Fim da resposta do Claude</p>
          <p
            className="rounded-md border-l-2 border-border bg-muted/40 px-2 py-1 text-xs whitespace-pre-wrap text-muted-foreground"
            data-testid="cv-recovery-claude-reply"
          >
            {recovery.claude_reply}
          </p>
        </div>
      )}
      {recovery.doubts.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Dúvidas do ChatGPT</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs" data-testid="cv-recovery-doubts">
            {recovery.doubts.map((doubt, index) => (
              <li key={index}>{doubt}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset className="space-y-2" data-testid="cv-resume">
        <legend className="px-1 text-xs font-semibold text-foreground">Como seguir?</legend>
        {recovery.options.map((option) => (
          <label key={option.key} className="flex items-start gap-2" data-testid={`cv-resume-option-${option.key}`}>
            <input
              type="radio"
              name={name}
              className="mt-1 accent-primary"
              checked={choice === option.key}
              onChange={() => setChoice(option.key)}
            />
            <span>
              <span className="font-semibold text-foreground">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
        {recovery.note_allowed && (
          <label className="flex items-start gap-2" data-testid="cv-resume-option-outro">
            <input
              type="radio"
              name={name}
              className="mt-1 accent-primary"
              checked={other}
              onChange={() => setChoice("outro")}
            />
            <span>
              <span className="font-semibold text-foreground">Outro</span>
              <span className="block text-xs text-muted-foreground">
                Escreva o que acha que deve ser feito: vai para o ChatGPT, que refaz o patch.
              </span>
            </span>
          </label>
        )}
        {other && (
          <div className="space-y-1">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ex.: pode tirar a categoria Python do grid; a vaga é de BI."
              rows={3}
              aria-label="O que deve ser feito"
              aria-describedby={`${name}-hint`}
              aria-invalid={problem !== null}
              data-testid="cv-resume-input"
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" id={`${name}-hint`}>
              <span data-testid="cv-resume-problem" className={cn(problem && "text-st-uncertain-fg")}>
                {problem ?? "Vai como orientação para o ChatGPT, dentro das regras do currículo."}
              </span>
              <span className="tabular-nums" data-testid="cv-resume-count">
                {length}/{INTAKE_MAX}
              </span>
            </div>
          </div>
        )}
      </fieldset>
      <Button size="sm" disabled={!ready || pending} data-testid="cv-resume-submit" onClick={submit}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Tentar de novo
      </Button>
    </div>
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
          kind === "analyze" ? "Análise no ChatGPT iniciada." : "Vaga específica descartada. Nada foi para a planilha."
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
              {confirm === "analyze" ? ACTION_META.ANALISAR_INDICADA.label : "Descartar a vaga específica"}
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
        toast.success("Vaga específica excluída do painel. Nada foi para a planilha.")
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
            <DialogTitle>Excluir a vaga específica</DialogTitle>
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
        Vagas específicas descartadas · {intakes.length}
      </summary>
      <ul className="mt-2 space-y-2">
        {intakes.map((dispatch) => {
          const job = dispatch.progress.intake?.found ? dispatch.progress.intake.job : null
          const text = dispatch.progress.intake_text
          return (
            <li key={dispatch.id} className="flex items-start gap-2" data-testid="intake-discarded-item">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="line-clamp-2 text-xs whitespace-pre-wrap" title={text ?? undefined}>
                  {job ? `${job.title}${job.company ? ` · ${job.company}` : ""}` : (text ?? "Vaga específica")}
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

/**
 * Jobs this search did not analyse (prefilter, over the budget, closed or unreadable), with why. The prefilter verdict
 * never blocks (decision 2026-10-03): each one can go to the ChatGPT analysis ("Mandar ao ChatGPT"); nothing goes there
 * or to the Sheet by default. Card text is the advertiser's untrusted plain text; links only through `safeHttpUrl`.
 */
function LeftOutJobs({
  search,
  progress,
  analyses,
  onChanged,
}: {
  search: Dispatch
  progress: DispatchProgress
  analyses: Dispatch[]
  onChanged: () => void
}) {
  const jobs = [...(progress.excluded_jobs ?? []), ...(progress.deferred_jobs ?? [])]
  const [pending, startTransition] = useTransition()
  const [sending, setSending] = useState<string | null>(null)
  if (jobs.length === 0) return null
  const ofJob = (jobId: string) =>
    latest(
      analyses.filter((dispatch) => dispatch.job_id === jobId),
      LEFT_OUT_ACTION
    )
  return (
    <Collapsible className="rounded-xl border border-border/70 p-3" data-testid="left-out">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-1 text-sm font-semibold" data-testid="left-out-toggle">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          Ficaram de fora · {jobs.length}
        </Button>
      </CollapsibleTrigger>
      <p className="mt-1 text-xs text-muted-foreground">
        O pré-filtro e o limite da rodada não impedem nada: mande ao ChatGPT a vaga que quiser analisar.
      </p>
      <CollapsibleContent>
        <ul className="mt-3 space-y-3">
          {jobs.map((job) => {
            const analysis = ofJob(job.job_id)
            const blocker = leftOutBlocker(job, analysis)
            const url = safeHttpUrl(job.url)
            return (
              <li key={job.job_id} className="space-y-2" data-testid="left-out-job" data-job-id={job.job_id}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {job.cargo || "(sem cargo)"}
                      {job.empresa && <span className="font-normal text-muted-foreground"> · {job.empresa}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[job.local, job.fonte].filter(Boolean).join(" · ")}
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center gap-0.5 hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          publicação
                        </a>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground" data-testid="left-out-reason">
                      <ToneBadge tone="muted" className="mr-1.5">
                        {leftOutKindLabel(job.kind)}
                      </ToneBadge>
                      {job.motivo}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={blocker !== null || pending}
                    title={blocker ?? undefined}
                    data-testid="left-out-send"
                    onClick={() => {
                      setSending(job.job_id)
                      startTransition(async () => {
                        try {
                          const result = await analyzeLeftOut(search.id, job.job_id)
                          if (!result.ok) {
                            toast.error(refusalText(result.code))
                            return
                          }
                          toast.success("Vaga mandada ao ChatGPT pelo job-search.")
                          onChanged()
                        } catch {
                          toast.error(refusalText("UNAUTHENTICATED"))
                        } finally {
                          setSending(null)
                        }
                      })
                    }}
                  >
                    {pending && sending === job.job_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                    )}
                    {analysis ? "Mandar de novo" : ACTION_META.ANALISAR_DESCOBERTA.verb}
                  </Button>
                </div>
                {blocker && (
                  <p className="text-xs text-muted-foreground" data-testid="left-out-blocker">
                    {blocker}
                  </p>
                )}
                {analysis && <DispatchCard dispatch={analysis} onChanged={onChanged} />}
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

const ACKABLE = new Set(["INCERTO", "FALHOU", "PRECISA_HUMANO", "PARADO", "MANUAL"])

export function DispatchCard({
  dispatch,
  knownJobIds,
  analysis = null,
  leftOutAnalyses,
  onChanged,
  onClose,
}: {
  dispatch: Dispatch
  knownJobIds?: ReadonlySet<string>
  /** BUSCAR_VAGAS: the ANALISAR_DESCOBERTA runs of jobs this search left out. */
  leftOutAnalyses?: Dispatch[]
  /** LOCALIZAR_VAGA: the latest analysis of this intake, if any. */
  analysis?: Dispatch | null
  onChanged: () => void
  /** "Fechar": takes the card off the panel (view only, the dispatcher is not told). */
  onClose?: () => void
}) {
  const intake = dispatch.action === "LOCALIZAR_VAGA" || dispatch.action === "ANALISAR_INDICADA"
  const [pending, startTransition] = useTransition()
  const progress =
    dispatch.action === "BUSCAR_VAGAS" && knownJobIds
      ? withRegistration(dispatch.progress, knownJobIds)
      : dispatch.progress
  const status = statusBadge(dispatch.status, progress)
  const Icon = ACTION_ICON[dispatch.action]
  // The "vaga indicada" cards stay on screen until the next intake, so they can be collapsed (view only).
  const collapsed = useCollapsed(intake ? dispatch.id : null)
  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => writeCollapsed(dispatch.id, !open)}
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
        {intake && (
          <CollapsibleTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={`Detalhes: ${ACTION_META[dispatch.action].label}`}
              title={collapsed ? "Mostrar detalhes" : "Recolher detalhes"}
              data-testid="dispatch-collapse"
            >
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
        )}
        {onClose && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Fechar: ${ACTION_META[dispatch.action].label}`}
            title="Fechar"
            data-testid="dispatch-close"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
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
      {/* forceMount keeps refine text and open dialogs across collapse, so hiding it while closed is up to us. */}
      <CollapsibleContent forceMount className="space-y-3 data-[state=closed]:hidden" data-testid="dispatch-details">
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
            Complementa uma descrição que o Lince não conseguiu localizar.
          </p>
        )}
        {canRefineIntake(dispatch) && <IntakeRefine key={dispatch.id} dispatch={dispatch} onChanged={onChanged} />}
        {dispatch.resumes && (
          <p className="text-xs text-muted-foreground" data-testid="cv-resumes">
            {dispatch.resume_option === "claude"
              ? "Retoma um currículo travado: só a edição no Claude, com o mesmo patch."
              : "Retoma um currículo travado: patch novo no ChatGPT."}
          </p>
        )}
        {canResumeCv(dispatch) && <CvResume key={dispatch.id} dispatch={dispatch} onChanged={onChanged} />}
        {dispatch.action === "EDITAR_CURRICULO" && progress.edit_request && (
          <div className="rounded-lg bg-muted/40 p-2 text-sm" data-testid="cv-edit-request">
            <span className="text-xs text-muted-foreground">Seu pedido</span>
            <p className="whitespace-pre-wrap break-words">{progress.edit_request}</p>
          </div>
        )}
        {(dispatch.action === "ANALISAR_VAGA" || dispatch.action === "ANALISAR_DESCOBERTA") && (
          <DiagnosisList progress={progress} testId="analysis-diagnosis" />
        )}
        {(dispatch.action === "BUSCAR_VAGAS" ||
          dispatch.action === "ANALISAR_VAGA" ||
          dispatch.action === "ANALISAR_DESCOBERTA" ||
          (dispatch.action === "ANALISAR_INDICADA" && !dispatch.discarded)) && (
          <WritesetRegistration dispatch={dispatch} progress={progress} onChanged={onChanged} />
        )}
        {intake && <IntakeDecisions dispatch={dispatch} analysis={analysis} onChanged={onChanged} />}
        {dispatch.action === "BUSCAR_VAGAS" && (
          <LeftOutJobs search={dispatch} progress={progress} analyses={leftOutAnalyses ?? []} onChanged={onChanged} />
        )}
        {(dispatch.code || dispatch.marker) && dispatch.status !== "CONCLUIDO" && (
          <p className="text-xs text-muted-foreground">
            Código: <span className="font-mono">{dispatch.code ?? dispatch.marker}</span>
            {dispatch.status === "PRECISA_HUMANO" &&
              (dispatch.mode === "host"
                ? dispatch.code === "PASTE_PROMPT_IN_CLAUDE"
                  ? " — cole o prompt abaixo no Claude in Chrome."
                  : dispatch.code === "POSTING_UNAVAILABLE" && dispatch.action === "ANALISAR_DESCOBERTA"
                    ? " — o job-search não conseguiu ler o texto desta vaga (página fora do ar ou sem descrição); abra a publicação e use \u201cBuscar vaga específica\u201d."
                    : dispatch.code === "POSTING_UNAVAILABLE"
                      ? " — o job-search não achou o texto desta vaga (sem publicação salva, sem dossier anterior e fora do LinkedIn)."
                      : canResumeCv(dispatch)
                        ? " — veja o motivo acima e escolha como seguir."
                        : dispatch.action === "EDITAR_CURRICULO"
                          ? " — o Claude parou sem PDF novo: veja a resposta no painel do Claude e peça a edição de novo, se quiser."
                          : dispatch.action === "PREENCHER_CANDIDATURA"
                            ? ` — ${applicationStopText(dispatch.code)}`
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
        {progress.claude_prompt && (
          <ClaudePromptBox
            prompt={progress.claude_prompt}
            url={progress.claude_url}
            stale={progress.prompt_stale === true}
          />
        )}
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
            {dispatch.status === "INCERTO"
              ? dispatch.mode === "host"
                ? "Conferi, liberar"
                : "Conferi no Desktop, liberar"
              : "Dispensar"}
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** After the Chrome opens: what is still on the user (never automated: no credentials go through the panel). */
function openBrowserText(value: OpenBrowserResult): string {
  if (value.browser === "application") {
    return value.already_open
      ? "O Chrome da candidatura já estava aberto. Confira o login no Claude e no portal da vaga."
      : "Chrome da candidatura aberto. Falta você: fazer login no Claude (e no portal da vaga, se pedir) e tentar de novo."
  }
  return value.already_open
    ? "O Chrome do Cloud Design já estava aberto. Confira o login no Claude e o painel do Claude nas abas de currículo PT e EN."
    : "Chrome do Cloud Design aberto. Falta você: fazer login no Claude e abrir o painel do Claude nas abas de currículo PT e EN."
}

type BrowserName = OpenBrowserResult["browser"]
const OPEN_BROWSER: Record<
  BrowserName,
  { open: () => Promise<Awaited<ReturnType<typeof openCvBrowser>>>; label: string }
> = {
  clouddesign: { open: openCvBrowser, label: "Abrir navegador do currículo" },
  application: { open: openApplicationBrowser, label: "Abrir navegador da candidatura" },
}
// A closed browser refusal → the browser the toast offers to open.
const CDP_DOWN_BROWSER: Record<string, BrowserName> = {
  CLOUDDESIGN_CDP_DOWN: "clouddesign",
  APPLICATION_CDP_DOWN: "application",
}

/** "Abrir navegador" from a toast: job-search opens the Chrome; the outcome is another toast. */
async function openBrowserToast(browser: BrowserName): Promise<void> {
  try {
    const result = await OPEN_BROWSER[browser].open()
    if (result.ok) toast.success(openBrowserText(result.value), { duration: 10_000 })
    else toast.error(refusalText(result.code))
  } catch {
    toast.error(refusalText("UNAUTHENTICATED"))
  }
}

/** A refusal toast; a closed Chrome (Cloud Design or application) also offers to open it right there. */
function toastRefusal(code: string): void {
  const browser = Object.hasOwn(CDP_DOWN_BROWSER, code) ? CDP_DOWN_BROWSER[code] : undefined
  if (browser) {
    toast.error(refusalText(code), {
      duration: 15_000,
      action: { label: "Abrir navegador", onClick: () => void openBrowserToast(browser) },
    })
    return
  }
  toast.error(refusalText(code))
}

/**
 * "Abrir navegador do currículo" / "da candidatura" (Hermes): job-search opens the Cloud Design Chrome (CDP 9226) or
 * the application Chrome (CDP 9227) the way the desktop shortcut does. Only the Chrome: signing in to Claude (and to
 * the job portal) stays with the user.
 */
function OpenBrowserButton({ browser }: { browser: BrowserName }) {
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <div className="space-y-2" data-testid={browser === "clouddesign" ? "open-cv-browser" : "open-application-browser"}>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        data-testid={`${browser === "clouddesign" ? "open-cv-browser" : "open-application-browser"}-button`}
        onClick={() =>
          startTransition(async () => {
            setOutcome(null)
            try {
              const result = await OPEN_BROWSER[browser].open()
              setOutcome(
                result.ok
                  ? { ok: true, text: openBrowserText(result.value) }
                  : { ok: false, text: refusalText(result.code) }
              )
            } catch {
              setOutcome({ ok: false, text: refusalText("UNAUTHENTICATED") })
            }
          })
        }
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <AppWindow className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? "Abrindo o navegador…" : OPEN_BROWSER[browser].label}
      </Button>
      {outcome && (
        <p
          className={cn("flex items-start gap-1.5 text-xs", outcome.ok ? "text-st-open-fg" : "text-st-review-fg")}
          role={outcome.ok ? "status" : "alert"}
          data-testid={`${browser === "clouddesign" ? "open-cv-browser" : "open-application-browser"}-outcome`}
        >
          {outcome.ok ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{outcome.text}</span>
        </p>
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
  verb,
  onStarted,
}: {
  action: BotAction
  jobId?: string
  disabledReason: string | null
  warning?: string | null
  primary?: boolean
  /** Button text when it differs from the action's verb ("Nova cotação"). */
  verb?: string
  onStarted: () => void
}) {
  const router = useRouter()
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
        {verb ?? meta.verb}
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
              {action === "GERAR_CURRICULO" && platform === "hermes" && <OpenBrowserButton browser="clouddesign" />}
              {action === "PREENCHER_CANDIDATURA" && platform === "hermes" && (
                <OpenBrowserButton browser="application" />
              )}
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
                      if (!result.ok && "blocker" in result) {
                        // Another job's application holds the slot: the modal closes so "Ver a vaga" is clickable.
                        const blocker = result.blocker
                        setOpen(false)
                        toast.error(`${refusalText(result.code)} Vaga ${blocker}.`, {
                          duration: 15_000,
                          action: {
                            label: "Ver a vaga",
                            onClick: () => router.push(`/vaga/${encodeURIComponent(blocker)}`),
                          },
                        })
                        return
                      }
                      if (!result.ok) {
                        toastRefusal(result.code)
                        // The modal blocks clicks outside it: close it so the toast's "Abrir navegador" is reachable.
                        if (Object.hasOwn(CDP_DOWN_BROWSER, result.code)) setOpen(false)
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
 * "Buscar vaga específica": free text for the Lince to find one specific job (Hermes only). The same guards as the
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

/**
 * "Mostrar"/"Esconder" one card group of "Cotar vagas". Pressed while shown; disabled while the group needs the user,
 * since it then stays on screen anyway.
 */
function CardToggle({
  label,
  shown,
  forced,
  onToggle,
  testId,
}: {
  label: string
  shown: boolean
  forced: boolean
  onToggle: () => void
  testId: string
}) {
  const Icon = shown ? EyeOff : Eye
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={shown}
      className={cn(shown && "bg-muted text-foreground")}
      disabled={forced}
      title={forced ? "Precisa de você: fica à mostra até resolver." : undefined}
      data-testid={testId}
      data-forced={forced || undefined}
      onClick={onToggle}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  )
}

/**
 * "Cotar vagas" (BUSCAR_VAGAS) and "Buscar vaga específica" (LOCALIZAR_VAGA, then ANALISAR_INDICADA) on /cotar. The
 * latest cards sit behind "Última cotação" and "Última vaga buscada" (view only, back to hidden on reload); a card
 * that needs the user (`needsUser()`) shows without them.
 */
export function SearchOps({ knownJobIds }: { knownJobIds: string[] }) {
  const { data, error, refresh } = useDispatches({ action: "BUSCAR_VAGAS" })
  const intakes = useDispatches({ action: "LOCALIZAR_VAGA" })
  const analyses = useDispatches({ action: "ANALISAR_INDICADA" })
  const leftOut = useDispatches({ action: LEFT_OUT_ACTION })
  const { refresh: refreshIntakes } = intakes
  const { refresh: refreshAnalyses } = analyses
  const { refresh: refreshLeftOut } = leftOut
  const refreshAll = useCallback(() => {
    void refresh()
    void refreshIntakes()
    void refreshAnalyses()
    void refreshLeftOut()
  }, [refresh, refreshIntakes, refreshAnalyses, refreshLeftOut])
  const [showSearch, setShowSearch] = useState(false)
  const [showIntake, setShowIntake] = useState(false)
  const known = useMemo(() => new Set(knownJobIds), [knownJobIds])
  const last = data ? latest(data.dispatches, "BUSCAR_VAGAS") : null
  const intake = intakes.data ? activeIntake(intakes.data.dispatches) : null
  const discarded = intakes.data ? discardedIntakes(intakes.data.dispatches) : []
  const analysis = intake && analyses.data ? analysisOf(analyses.data.dispatches, intake.id) : null
  // "Fechar" hides the intake and its analysis in this browser only; a newer intake shows up as usual.
  const closed = useClosed(intake?.id ?? null)
  const closeIntake = intake && !intake.active && !analysis?.active ? () => writeClosed(intake.id, true) : undefined
  const leftOutOfLast = (leftOut.data?.dispatches ?? []).filter((dispatch) => dispatch.source_id === last?.id)
  // A left-out job's analysis lives inside the search card: running, waiting or unregistered keeps the card shown.
  const searchForced =
    last !== null &&
    (needsUser(last, withRegistration(last.progress, known)) || leftOutOfLast.some((dispatch) => needsUser(dispatch)))
  const intakeForced = needsUser(intake) || needsUser(analysis)
  const searchShown = last !== null && (searchForced || showSearch)
  const hasIntakes = intake !== null || discarded.length > 0
  const intakeShown = hasIntakes && (intakeForced || showIntake)
  // Search and intake share the Lince's Bot Chat: one at a time (the dispatcher refuses with PROFILE_BUSY). The
  // intake analysis runs on the host and does not hold the Lince, but it holds the ChatGPT the search also uses.
  const linceBusy = [last, intake].some((dispatch) => dispatch?.active)
    ? "O Lince já está com um disparo em andamento."
    : null
  const chatgptBusy = (analyses.data?.dispatches ?? []).some((dispatch) => dispatch.active)
    ? "A análise da vaga específica está usando o ChatGPT."
    : (leftOut.data?.dispatches ?? []).some((dispatch) => dispatch.active)
      ? "A análise de uma vaga que ficou de fora está usando o ChatGPT."
      : null
  const reason = (last?.active ? "Já existe uma cotação em andamento." : null) ?? linceBusy ?? chatgptBusy
  const intakeReason = linceBusy ?? gatewayReason(data, "hermes")
  const shownError = error ?? intakes.error ?? analyses.error
  return (
    <section className="space-y-4" data-testid="search-ops" aria-label="Cotação de vagas pelos bots">
      <div className="flex flex-wrap items-center gap-2">
        <DispatchButton
          action="BUSCAR_VAGAS"
          verb={searchVerb(last)}
          disabledReason={reason}
          primary
          onStarted={() => {
            setShowSearch(true)
            refreshAll()
          }}
        />
        <IntakeButton
          disabledReason={intakeReason}
          onStarted={() => {
            setShowIntake(true)
            refreshAll()
          }}
        />
        {last && (
          <CardToggle
            label="Última cotação"
            shown={searchShown}
            forced={searchForced}
            onToggle={() => setShowSearch((on) => !on)}
            testId="toggle-search"
          />
        )}
        {hasIntakes && (
          <CardToggle
            label="Última vaga buscada"
            shown={intakeShown}
            forced={intakeForced}
            onToggle={() => {
              // Showing the group also reopens an intake closed with "Fechar".
              if (!intakeShown && intake && closed) writeClosed(intake.id, false)
              setShowIntake((on) => !on)
            }}
            testId="toggle-intake"
          />
        )}
        {shownError && <span className="text-xs text-muted-foreground">{refusalText(shownError)}</span>}
      </div>
      {searchShown && last && (
        <DispatchCard dispatch={last} knownJobIds={known} leftOutAnalyses={leftOutOfLast} onChanged={refreshAll} />
      )}
      {intakeShown && (
        <div className="space-y-3" data-testid="intake-group">
          {intake && !closed && (
            <div className="grid gap-3 lg:grid-cols-2" data-testid="intake-ops">
              <DispatchCard dispatch={intake} analysis={analysis} onChanged={refreshAll} onClose={closeIntake} />
              {analysis && <DispatchCard dispatch={analysis} onChanged={refreshAll} onClose={closeIntake} />}
            </div>
          )}
          {intake && closed && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              data-testid="intake-reopen"
              onClick={() => writeClosed(intake.id, false)}
            >
              Mostrar a vaga específica
            </Button>
          )}
          <DiscardedIntakes intakes={discarded} onChanged={refreshAll} />
        </div>
      )}
    </section>
  )
}

/**
 * Bot actions of one job, split by the three sections of the job page (Análise da vaga, Currículo, Candidatura). One
 * provider holds the job's dispatch list (one poll for the page); each section shows its own buttons and cards. No
 * verdict, availability or application state disables them (the user chooses, decision 2026-10-02); only the same
 * action already running does. job-search refuses with a code when it cannot run, shown in a toast.
 */
type JobOpsState = { jobId: string; data: DispatchList | null; error: string | null; refresh: () => Promise<void> }
const JobOpsContext = createContext<JobOpsState | null>(null)

export function JobOpsProvider({ jobId, children }: { jobId: string; children: React.ReactNode }) {
  const { data, error, refresh } = useDispatches({ jobId })
  const value = useMemo(() => ({ jobId, data, error, refresh }), [jobId, data, error, refresh])
  return <JobOpsContext.Provider value={value}>{children}</JobOpsContext.Provider>
}

function useJobOps(): JobOpsState {
  const value = useContext(JobOpsContext)
  if (!value) throw new Error("JobOpsProvider ausente")
  return value
}

function OpsBar({ testId, label, children }: { testId: string; label: string; children: React.ReactNode }) {
  const { error } = useJobOps()
  return (
    <section
      className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4"
      data-testid={testId}
      aria-label={label}
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {error && <p className="text-xs text-muted-foreground">{refusalText(error)}</p>}
    </section>
  )
}

/** "Análise da vaga": Analisar / Refazer análise and its card. */
export function JobAnalysisOps({ analyzed }: { analyzed: boolean }) {
  const { jobId, data, refresh } = useJobOps()
  const analysis = latest(data?.dispatches ?? [], "ANALISAR_VAGA")
  return (
    <OpsBar testId="job-ops-analysis" label="Análise desta vaga pelos bots">
      <AnalyzeButton
        jobId={jobId}
        analyzed={analyzed}
        disabledReason={analyzeJobBlocker(analysis)}
        onStarted={refresh}
      />
      {analysis && (
        <div className="basis-full">
          <DispatchCard dispatch={analysis} onChanged={refresh} />
        </div>
      )}
    </OpsBar>
  )
}

/** "Currículo": status, the PDF job-search registered for this job, Gerar currículo and its card. */
export function JobCvOps() {
  const { jobId, data, refresh } = useJobOps()
  const cv = latest(data?.dispatches ?? [], "GERAR_CURRICULO")
  const edit = latest(data?.dispatches ?? [], CV_EDIT_ACTION)
  const job = data?.job
  const cvReady = job?.cv === "VALID"
  return (
    <div className="space-y-4">
      <OpsBar testId="job-ops-cv" label="Currículo desta vaga pelos bots">
        <DispatchButton
          action="GERAR_CURRICULO"
          jobId={jobId}
          disabledReason={cv?.active ? "Geração de currículo em andamento." : null}
          onStarted={refresh}
        />
        {job && (
          <ToneBadge tone={cvReady ? "good" : "muted"} className="ml-auto" data-testid="cv-status">
            {cvReady ? "Currículo pronto" : "Currículo não gerado"}
          </ToneBadge>
        )}
        {cv && (
          <div className="basis-full">
            <DispatchCard dispatch={cv} onChanged={refresh} />
          </div>
        )}
      </OpsBar>
      {/* Re-read the file whenever job-search's verdict on the résumé changes (a new PDF was just recorded). */}
      <CvPreview key={`${job?.cv ?? "?"}:${cv?.finished_at ?? ""}:${edit?.finished_at ?? ""}`} jobId={jobId} />
      <CvEditForm
        jobId={jobId}
        disabledReason={
          edit?.active
            ? "Edição em andamento."
            : cv?.active
              ? "Geração de currículo em andamento."
              : job && !cvReady
                ? "Gere o currículo desta vaga antes de pedir edição."
                : null
        }
        onStarted={refresh}
      />
      {edit && <DispatchCard dispatch={edit} onChanged={refresh} />}
    </div>
  )
}

/** "Candidatura": Preencher vaga and its card. */
export function JobApplicationOps() {
  const { jobId, data, refresh } = useJobOps()
  const application = latest(data?.dispatches ?? [], "PREENCHER_CANDIDATURA")
  const cvReady = data?.job?.cv === "VALID"
  return (
    <OpsBar testId="job-ops-application" label="Candidatura desta vaga pelos bots">
      <DispatchButton
        action="PREENCHER_CANDIDATURA"
        jobId={jobId}
        primary
        disabledReason={application?.active ? "Candidatura em andamento." : null}
        warning={cvReady ? null : "O currículo desta vaga ainda não está pronto. O recomendado é gerar antes."}
        onStarted={refresh}
      />
      {application && (
        <div className="basis-full">
          <DispatchCard dispatch={application} onChanged={refresh} />
        </div>
      )}
    </OpsBar>
  )
}

/**
 * "Pedir edição": free text for any change in this job's résumé, run by Hermes (job-search host) or the Grok CV
 * Operator. The text is the user's own (decision 2026-10-03, option B): it goes straight to Claude in Chrome, without
 * ChatGPT. Same guards as the "vaga indicada"; the server and job-search check again.
 */
function CvEditForm({
  jobId,
  disabledReason,
  onStarted,
}: {
  jobId: string
  disabledReason: string | null
  onStarted: () => void
}) {
  const platform = usePlatform()
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const check = normalizeIntake(text)
  const length = intakeLength(text.trim())
  const problem =
    text.trim() === "" || check.ok
      ? null
      : refusalText(check.code === "INTAKE_LOOKS_LIKE_APPROVAL" ? "REQUEST_LOOKS_LIKE_APPROVAL" : "REQUEST_INVALID")
  return (
    <section className="space-y-2 rounded-2xl border border-border p-4" data-testid="cv-edit" aria-label="Pedir edição">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="cv-edit-input" className="text-sm font-semibold">
          Pedir edição do currículo
        </Label>
        <span className="ml-auto">
          <PlatformToggle />
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{ACTION_META.EDITAR_CURRICULO.description}</p>
      <Textarea
        id="cv-edit-input"
        value={text}
        maxLength={INTAKE_MAX + 200}
        rows={4}
        placeholder="Ex.: troque o headline para “Engenharia Química | Processos e Dados” e tire a categoria Power BI."
        disabled={disabledReason !== null}
        data-testid="cv-edit-input"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="cv-edit-count">
          {length}/{INTAKE_MAX}
        </span>
        {problem && (
          <span className="text-xs text-st-review-fg" data-testid="cv-edit-problem">
            {problem}
          </span>
        )}
        {disabledReason && (
          <span className="text-xs text-muted-foreground" data-testid="cv-edit-disabled">
            {disabledReason}
          </span>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={disabledReason !== null || !check.ok || pending}
          data-testid="cv-edit-submit"
          onClick={() =>
            startTransition(async () => {
              if (!check.ok) return
              try {
                const result = await editCv(jobId, { platform, text: check.text })
                if (!result.ok) {
                  toastRefusal(result.code)
                  return
                }
                toast.success(
                  platform === "grok"
                    ? "Comando pronto: cole no CV Operator do Grok."
                    : "Edição pedida ao job-search (Claude in Chrome)."
                )
                setText("")
                onStarted()
              } catch {
                toast.error(refusalText("UNAUTHENTICATED"))
              }
            })
          }
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <PencilLine className="h-4 w-4" aria-hidden="true" />
          )}
          {ACTION_META.EDITAR_CURRICULO.verb} · {PLATFORM_LABEL[platform]}
        </Button>
      </div>
    </section>
  )
}

type CvPreviewState = { state: "loading" } | { state: "ready"; file: CvFileInfo } | { state: "none"; text: string }

/**
 * The résumé PDF job-search recorded for this job (`cv.json`), inline. The bytes come from
 * `/api/vaga/[job_id]/curriculo`; `?v=` is the file hash, so a new PDF is never served from the browser cache.
 */
function CvPreview({ jobId }: { jobId: string }) {
  const [preview, setPreview] = useState<CvPreviewState>({ state: "loading" })
  useEffect(() => {
    let alive = true
    getCvFile(jobId)
      .then((result) => {
        if (!alive) return
        setPreview(
          result.ok
            ? { state: "ready", file: result.value }
            : { state: "none", text: cvFileText(result.code, result.detail) }
        )
      })
      .catch(() => alive && setPreview({ state: "none", text: refusalText("UNAUTHENTICATED") }))
    return () => {
      alive = false
    }
  }, [jobId])
  if (preview.state === "loading") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="cv-preview-loading">
        <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden="true" />
        Procurando o currículo desta vaga…
      </p>
    )
  }
  if (preview.state === "none") {
    return (
      <p
        className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"
        data-testid="cv-preview-empty"
      >
        {preview.text}
      </p>
    )
  }
  const { file } = preview
  const src = `/api/vaga/${encodeURIComponent(jobId)}/curriculo?v=${file.sha256.slice(0, 12)}`
  return (
    <div className="space-y-2" data-testid="cv-preview">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-xs break-all" data-testid="cv-preview-filename">
          {file.filename}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(file.exported_at)} · {Math.max(1, Math.round(file.size / 1024))} KB
        </span>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="cv-preview-open"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Abrir PDF
        </a>
      </div>
      <iframe
        src={src}
        title={`Currículo: ${file.filename}`}
        className="h-[42rem] w-full rounded-xl border border-border bg-white"
        data-testid="cv-preview-frame"
      />
    </div>
  )
}
