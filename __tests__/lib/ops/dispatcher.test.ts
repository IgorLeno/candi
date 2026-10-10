import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { dispatchConfig, runDispatcher, type DispatchConfig } from "@/lib/ops/dispatcher"

// A fake dispatcher: prints whatever the first argument asks for, so the runner is exercised end to end
// (execFile, exit codes, JSON parsing, env) without job-search.
const FAKE = `
import json, os, sys
mode = sys.argv[1]
if mode == "ok":
    print(json.dumps({"ok": True, "n": 1}))
elif mode == "refuse":
    print(json.dumps({"ok": False, "code": "GATEWAY_NOT_RUNNING", "detail": "parado"})); sys.exit(1)
elif mode == "garbage":
    print("Traceback: segredo"); sys.exit(1)
elif mode == "traceback":
    sys.stderr.write("Traceback (most recent call last):\\nImportError: cv_local\\n"); sys.exit(1)
elif mode == "crash":
    print(json.dumps({"ok": True, "n": 1})); sys.exit(3)
elif mode == "env":
    print(json.dumps({"ok": True, "keys": sorted(os.environ)}))
elif mode == "stdin":
    print(json.dumps({"ok": True, "stdin": sys.stdin.read(), "argv": sys.argv[1:]}))
`

function fakeConfig(): DispatchConfig {
  const dir = mkdtempSync(path.join(tmpdir(), "fake-dispatch-"))
  const script = path.join(dir, "dispatch.py")
  writeFileSync(script, FAKE)
  return { python: "python3", script }
}

const okSchema = z.object({ ok: z.literal(true), n: z.number() })

describe("dispatchConfig", () => {
  it("is off unless explicitly enabled with an absolute repo path", () => {
    expect(dispatchConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(dispatchConfig({ JOB_SEARCH_DISPATCH_ENABLED: "1", JOB_SEARCH_REPO: "/r" } as never)).toBeNull()
    expect(dispatchConfig({ JOB_SEARCH_DISPATCH_ENABLED: "true", JOB_SEARCH_REPO: "rel" } as never)).toBeNull()
    expect(dispatchConfig({ JOB_SEARCH_DISPATCH_ENABLED: "true", JOB_SEARCH_REPO: "/r" } as never)).toEqual({
      python: "python3",
      script: "/r/hermes/browsers/dispatch.py",
    })
  })
})

describe("runDispatcher", () => {
  const saved = process.env.AUTH_SECRET
  afterEach(() => {
    process.env.AUTH_SECRET = saved
  })

  it("refuses when disabled", async () => {
    await expect(runDispatcher(["ok"], okSchema, null)).resolves.toEqual({ ok: false, code: "DISPATCH_DISABLED" })
  })

  it("returns parsed output on success and the refusal code on exit 1", async () => {
    const config = fakeConfig()
    await expect(runDispatcher(["ok"], okSchema, config)).resolves.toEqual({ ok: true, value: { ok: true, n: 1 } })
    await expect(runDispatcher(["refuse"], okSchema, config)).resolves.toEqual({
      ok: false,
      code: "GATEWAY_NOT_RUNNING",
      detail: "parado",
    })
  })

  it("never leaks raw output: garbage, crash or schema mismatch become DISPATCHER_UNAVAILABLE", async () => {
    const config = fakeConfig()
    const unavailable = { ok: false, code: "DISPATCHER_UNAVAILABLE" }
    await expect(runDispatcher(["garbage"], okSchema, config)).resolves.toEqual(unavailable)
    await expect(runDispatcher(["crash"], okSchema, config)).resolves.toEqual(unavailable)
    await expect(runDispatcher(["env"], okSchema, config)).resolves.toEqual(unavailable)
    await expect(runDispatcher(["ok"], okSchema, { python: "/nonexistent/python", script: "x" })).resolves.toEqual(
      unavailable
    )
  })

  it("logs the cause of DISPATCHER_UNAVAILABLE on the server only, without output values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const config = fakeConfig()
      await runDispatcher(["traceback"], okSchema, config)
      expect(log).toHaveBeenLastCalledWith(
        expect.stringContaining("[dispatcher] traceback: output is not JSON; exit 1")
      )
      expect(log).toHaveBeenLastCalledWith(expect.stringContaining("ImportError: cv_local"))
      const schema = z.object({ ok: z.literal(true), n: z.string() })
      await runDispatcher(["ok"], schema, config)
      expect(log).toHaveBeenLastCalledWith("[dispatcher] ok: schema mismatch at n; exit 0")
    } finally {
      log.mockRestore()
    }
  })

  it("passes a minimal environment (no auth secrets) to the dispatcher", async () => {
    process.env.AUTH_SECRET = "must-not-leak"
    const schema = z.object({ ok: z.literal(true), keys: z.array(z.string()) })
    const result = await runDispatcher(["env"], schema, fakeConfig())
    expect(result.ok).toBe(true)
    const keys = result.ok ? result.value.keys : []
    expect(keys).not.toContain("AUTH_SECRET")
    expect(keys.every((key) => ["HOME", "PATH", "LANG", "LC_CTYPE", "JOB_SEARCH_BROWSERS_STATE"].includes(key))).toBe(
      true
    )
  })

  it("sends the intake text over stdin (never argv) and closes stdin otherwise", async () => {
    const schema = z.object({ ok: z.literal(true), stdin: z.string(), argv: z.array(z.string()) })
    const config = fakeConfig()
    const text = "Estágio na Braskem\nsegunda linha --platform grok"
    await expect(runDispatcher(["stdin"], schema, config, { stdin: text })).resolves.toEqual({
      ok: true,
      value: { ok: true, stdin: text, argv: ["stdin"] },
    })
    // Without stdin the pipe is closed at once: a reader gets EOF instead of hanging until the timeout.
    await expect(runDispatcher(["stdin"], schema, config)).resolves.toEqual({
      ok: true,
      value: { ok: true, stdin: "", argv: ["stdin"] },
    })
  })
})
