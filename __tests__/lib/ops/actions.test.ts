import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildJobSearchData } from "@/lib/job-search/build"
import { fixtureSnapshot } from "@/__tests__/lib/job-search/helpers"

const session = vi.hoisted(() => ({ current: null as null | { user: { email: string } } }))
const runDispatcher = vi.hoisted(() => vi.fn())
const views = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock("@/lib/auth/session", () => ({ getAllowedSession: vi.fn(async () => session.current) }))
vi.mock("@/lib/ops/dispatcher", () => ({ runDispatcher }))
vi.mock("@/lib/job-search/source", () => ({ getJobSearchData: vi.fn(async () => ({ views: views.current })) }))

import { ackDispatch, listDispatches, startDispatch } from "@/app/actions/ops"

describe("ops server actions", () => {
  beforeEach(() => {
    session.current = { user: { email: "owner@e2e.test" } }
    runDispatcher.mockReset()
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, dispatch: { id: "d" } } })
    views.current = buildJobSearchData(fixtureSnapshot(), "fixture", "2026-09-29T12:00:00Z").views
  })

  it("require a session before anything else (the proxy does not cover Server Functions)", async () => {
    session.current = null
    await expect(startDispatch({ action: "BUSCAR_VAGAS", platform: "hermes" })).rejects.toThrow("UNAUTHENTICATED")
    await expect(listDispatches({})).rejects.toThrow("UNAUTHENTICATED")
    await expect(ackDispatch("d-20260929T120000Z-abcdef")).rejects.toThrow("UNAUTHENTICATED")
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("reject malformed input without calling the dispatcher", async () => {
    for (const input of [
      null,
      { action: "BUSCAR_VAGAS" },
      { action: "BUSCAR_VAGAS", platform: "hermes", text: "ok 1a2b3c4d" },
      { action: "PREENCHER_CANDIDATURA", platform: "hermes", jobId: "../../etc" },
    ]) {
      await expect(startDispatch(input)).resolves.toEqual({ ok: false, code: "INPUT_INVALID" })
    }
    await expect(ackDispatch("x; rm -rf /")).resolves.toEqual({ ok: false, code: "INPUT_INVALID" })
    await expect(listDispatches({ jobId: "a b" })).resolves.toEqual({ ok: false, code: "INPUT_INVALID" })
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("check the job against the Sheet snapshot for per-job actions", async () => {
    await expect(
      startDispatch({ action: "GERAR_CURRICULO", platform: "hermes", jobId: "nao-existe" })
    ).resolves.toEqual({ ok: false, code: "JOB_NOT_FOUND" })
    // fake-1006 is ENVIADA in the fixture: no bot action on it.
    await expect(
      startDispatch({ action: "PREENCHER_CANDIDATURA", platform: "hermes", jobId: "fake-1006" })
    ).resolves.toEqual({ ok: false, code: "JOB_BLOCKED" })
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("send only the fixed argv to the dispatcher", async () => {
    await startDispatch({ action: "GERAR_CURRICULO", platform: "grok", jobId: "fake-1001" })
    expect(runDispatcher.mock.calls[0][0]).toEqual([
      "start",
      "GERAR_CURRICULO",
      "--platform",
      "grok",
      "--job-id",
      "fake-1001",
    ])
    await startDispatch({ action: "BUSCAR_VAGAS", platform: "hermes" })
    expect(runDispatcher.mock.calls[1][0]).toEqual(["start", "BUSCAR_VAGAS", "--platform", "hermes"])
    await listDispatches({ jobId: "fake-1001" })
    expect(runDispatcher.mock.calls[2][0]).toEqual(["list", "--limit", "5", "--job-id", "fake-1001"])
  })

  it("pass dispatcher refusals through as codes only", async () => {
    runDispatcher.mockResolvedValue({ ok: false, code: "GATEWAY_NOT_RUNNING", detail: "parado" })
    await expect(startDispatch({ action: "BUSCAR_VAGAS", platform: "hermes" })).resolves.toEqual({
      ok: false,
      code: "GATEWAY_NOT_RUNNING",
    })
  })
})
