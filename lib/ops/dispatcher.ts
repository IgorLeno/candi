import "server-only"
import { execFile } from "node:child_process"
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
 * (missing python, timeout, bad JSON) → DISPATCHER_UNAVAILABLE. Errors never carry stderr to the client.
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
      (error, stdout) => {
        const line = stdout.trim().split("\n").pop() ?? ""
        let parsed: unknown
        try {
          parsed = JSON.parse(line)
        } catch {
          resolve({ ok: false, code: "DISPATCHER_UNAVAILABLE" })
          return
        }
        const refusal = refusalSchema.safeParse(parsed)
        if (refusal.success) {
          resolve(refusal.data)
          return
        }
        const value = error ? null : schema.safeParse(parsed)
        resolve(value?.success ? { ok: true, value: value.data } : { ok: false, code: "DISPATCHER_UNAVAILABLE" })
      }
    )
    // A dispatcher that exits early (or a missing python) closes the pipe: the exit callback reports it.
    child.stdin?.on("error", () => {})
    child.stdin?.end(options.stdin ?? "")
  })
}
