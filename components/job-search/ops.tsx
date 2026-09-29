"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Bot, CheckCircle2, Circle, Copy, FileText, Loader2, Radar, XCircle, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { ackDispatch, listDispatches, startDispatch } from "@/app/actions/ops"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ToneBadge } from "@/components/job-search/tone-badge"
import { formatTimestamp } from "@/lib/job-search/present"
import { usePlatform, writePlatform } from "@/lib/ops/platform-pref"
import { ACTION_META, PLATFORM_LABEL, STATUS_META, latest, refusalText, withRegistration } from "@/lib/ops/present"
import { PLATFORMS, type Dispatch, type DispatchAction, type DispatchList, type DispatchStage } from "@/lib/ops/schema"
import { cn } from "@/lib/utils"

const ACTION_ICON: Record<DispatchAction, LucideIcon> = {
  BUSCAR_VAGAS: Radar,
  GERAR_CURRICULO: FileText,
  PREENCHER_CANDIDATURA: Bot,
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

  const running = data?.dispatches.some((dispatch) => dispatch.status === "PENDENTE" || dispatch.status === "RODANDO")
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

const ACKABLE = new Set(["INCERTO", "FALHOU", "PRECISA_HUMANO", "PARADO", "MANUAL"])

export function DispatchCard({
  dispatch,
  knownJobIds,
  onChanged,
}: {
  dispatch: Dispatch
  knownJobIds?: ReadonlySet<string>
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const progress =
    dispatch.action === "BUSCAR_VAGAS" && knownJobIds
      ? withRegistration(dispatch.progress, knownJobIds)
      : dispatch.progress
  const status = STATUS_META[dispatch.status]
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
        <ToneBadge tone={status.tone} className="ml-auto" data-testid="dispatch-status">
          {status.label}
        </ToneBadge>
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
      {dispatch.action === "BUSCAR_VAGAS" && progress.writeset_path && (
        <p className="text-xs text-muted-foreground" data-testid="writeset-pending">
          Writeset em <span className="font-mono">{progress.writeset_path}</span>. O coordenador grava na planilha (
          <span className="font-mono">writeset.py persist</span>); depois clique em Sincronizar.
        </p>
      )}
      {(dispatch.code || dispatch.marker) && dispatch.status !== "CONCLUIDO" && (
        <p className="text-xs text-muted-foreground">
          Código: <span className="font-mono">{dispatch.code ?? dispatch.marker}</span>
          {dispatch.status === "PRECISA_HUMANO" && " — veja o Bot Chat no Hermes Desktop."}
          {dispatch.status === "INCERTO" &&
            " — o acompanhamento caiu; confira o Bot Chat no Hermes Desktop antes de liberar um novo disparo."}
        </p>
      )}
      {dispatch.command && <CommandBox command={dispatch.command} />}
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
  action: DispatchAction
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

function gatewayReason(data: DispatchList | null, platform: string): string | null {
  if (platform !== "hermes" || !data || data.gateway === "running") return null
  return "Gateway Hermes parado ou sem inferência. Inicie-o ou troque para Grok."
}

/** "Buscar vagas" plus the latest search progress (Hoje and /vagas). */
export function SearchOps({ knownJobIds }: { knownJobIds: string[] }) {
  const { data, error, refresh } = useDispatches({ action: "BUSCAR_VAGAS" })
  const platform = usePlatform()
  const known = useMemo(() => new Set(knownJobIds), [knownJobIds])
  const last = data ? latest(data.dispatches, "BUSCAR_VAGAS") : null
  const reason = (last?.active ? "Já existe uma busca em andamento." : null) ?? gatewayReason(data, platform)
  return (
    <section className="space-y-3" data-testid="search-ops" aria-label="Busca de vagas pelos bots">
      <div className="flex flex-wrap items-center gap-2">
        <DispatchButton action="BUSCAR_VAGAS" disabledReason={reason} primary onStarted={refresh} />
        {error && <span className="text-xs text-muted-foreground">{refusalText(error)}</span>}
      </div>
      {last && <DispatchCard dispatch={last} knownJobIds={known} onChanged={refresh} />}
    </section>
  )
}

/** Bot actions of one job: "Gerar currículo" first, then "Preencher candidatura". */
export function JobOps({ jobId, blocker }: { jobId: string; blocker: string | null }) {
  const { data, error, refresh } = useDispatches({ jobId })
  const platform = usePlatform()
  const cv = latest(data?.dispatches ?? [], "GERAR_CURRICULO")
  const application = latest(data?.dispatches ?? [], "PREENCHER_CANDIDATURA")
  const job = data?.job
  const base =
    blocker ??
    (job && !job.actionable ? "Sem dossier válido (SELECIONADA e ABERTA) no runtime do job-search." : null) ??
    gatewayReason(data, platform)
  const cvReady = job?.cv === "VALID"
  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4"
      data-testid="job-ops"
      aria-label="Operação dos bots nesta vaga"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bots</span>
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
      {(cv || application) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {cv && <DispatchCard dispatch={cv} onChanged={refresh} />}
          {application && <DispatchCard dispatch={application} onChanged={refresh} />}
        </div>
      )}
    </section>
  )
}
