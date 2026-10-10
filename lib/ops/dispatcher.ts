import "server-only"
import { execFile, type ExecFileException } from "node:child_process"
import path from "node:path"
import { z } from "zod"
import { refusalSchema, type DispatchRefusal } from "@/lib/ops/schema"

// Runs job-search's `hermes/browsers/dispatch.py` with a fixed argv (no shell). The panel never sees the
// gateway token or talks to Hermes: the dispatcher owns commands, preconditions and delivery.

export interface DispatchConfig {
  python: string
  script: string
}

/** Enabled only with JOB_SEARCH_DISPATCH_ENABLED=true and an absolute JOB_SEARCH_REPO. */
export function dispatchConfig(env: NodeJS.ProcessEnv = process.env): DispatchConfig | null {
  if (env.JOB_SEARCH_DISPATCH_ENABLED !== "true") return null
  const repo = env.JOB_SEARCH_REPO
  if (!repo || !path.isAbsolute(repo)) return null
  return {
    python: env.JOB_SEARCH_DISPATCH_PYTHON || "python3",
    script: path.join(repo, "hermes", "browsers", "dispatch.py"),
  }
}

export function isDispatchEnabled(): boolean {
  return dispatchConfig() !== null
}

// Only what the dispatcher needs: no auth secrets, no Sheet credentials.
const PASSTHROUGH_ENV = ["HOME", "PATH", "LANG", "JOB_SEARCH_BROWSERS_STATE", "JSB_HERMES_BASE", "JSB_GATEWAY_PORT"]

export type RunResult<T> = { ok: true; value: T } | DispatchRefusal

/**
 * One dispatcher call. Exit 0 → `schema`; exit 1 with `{ok:false, code}` → refusal; anything else
 * (missing python, timeout, bad JSON) → DISPATCHER_UNAVAILABLE. Errors never carry stderr to the client; the cause
 * goes only to the server log (`logUnavailable`), since the generic message alone could not be diagnosed (2026-10-09).
 * `stdin` carries the only free text (the "vaga indicada"), so it never lands in argv; stdin is always closed.
 */
export function runDispatcher<T>(
  args: string[],
  schema: z.ZodType<T>,
  config: DispatchConfig | null = dispatchConfig(),
  options: { stdin?: string } = {}
): Promise<RunResult<T>> {
  if (!config) return Promise.resolve({ ok: false, code: "DISPATCH_DISABLED" })
  const env = Object.fromEntries(
    PASSTHROUGH_ENV.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : []))
  ) as NodeJS.ProcessEnv
  return new Promise((resolve) => {
    const child = execFile(
      config.python,
      [config.script, ...args],
      { env, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const line = stdout.trim().split("\n").pop() ?? ""
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          logUnavailable(args[0], "output is not JSON", error, stderr)
          resolve({ ok: false, code: "DISPATCHER_UNAVAILABLE" })
          return
        }
        const refusal = refusalSchema.safeParse(parsed)
        if (refusal.success) {
          resolve(refusal.data)
          return
        }
        const value = error ? null : schema.safeParse(parsed)
        if (value?.success) {
          resolve({ ok: true, value: value.data })
          return
        }
        // Only the paths of the mismatch, never the values (they may carry job or résumé text).
        const issues = value?.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ")
        logUnavailable(args[0], value ? `schema mismatch at ${issues}` : "JSON with a failed exit", error, stderr)
        resolve({ ok: false, code: "DISPATCHER_UNAVAILABLE" })
      }
    )
    // A dispatcher that exits early (or a missing python) closes the pipe: the exit callback reports it.
    child.stdin?.on("error", () => {})
    child.stdin?.end(options.stdin ?? "")
  })
}

function logUnavailable(command: string | undefined, reason: string, error: ExecFileException | null, stderr: string) {
  const exit = error
    ? error.killed
      ? `killed (${error.signal ?? "timeout"})`
      : `exit ${error.code ?? "?"}${error.signal ? ` signal ${error.signal}` : ""}`
    : "exit 0"
  const tail = stderr.trim().slice(-800)
  console.error(`[dispatcher] ${command ?? "?"}: ${reason}; ${exit}${tail ? `\n${tail}` : ""}`)
}
