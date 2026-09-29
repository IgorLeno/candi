import { describe, expect, it } from "vitest"
import { jobDispatchBlocker, latest, refusalText, withRegistration } from "@/lib/ops/present"
import { dispatchSchema, startInputSchema, type Dispatch, type DispatchProgress } from "@/lib/ops/schema"

const cell = (value: string | null, invalid = false) => ({ value, invalid, tone: "neutral" as const })

const open = {
  statusAnalise: cell("SELECIONADA"),
  statusDisponibilidade: cell("ABERTA"),
  statusCandidatura: cell("NÃO INICIADA"),
  archived: false,
  uncertainSubmit: false,
}

describe("jobDispatchBlocker", () => {
  it("allows a selected, open job not yet sent", () => {
    expect(jobDispatchBlocker(open)).toBeNull()
  })

  it("blocks uncertain submits first, whatever else is true", () => {
    expect(jobDispatchBlocker({ ...open, uncertainSubmit: true })).toMatch(/ENVIO INCERTO/)
    expect(jobDispatchBlocker({ ...open, statusCandidatura: cell("ENVIO INCERTO") })).toMatch(/ENVIO INCERTO/)
  })

  it("blocks sent, withdrawn, closed, archived, invalid and not selected jobs", () => {
    expect(jobDispatchBlocker({ ...open, statusCandidatura: cell("ENVIADA") })).toMatch(/enviada/)
    expect(jobDispatchBlocker({ ...open, statusCandidatura: cell("RETIRADA") })).toMatch(/retirada/)
    expect(jobDispatchBlocker({ ...open, statusDisponibilidade: cell("ENCERRADA") })).toMatch(/não está aberta/)
    expect(jobDispatchBlocker({ ...open, archived: true })).toMatch(/não está aberta/)
    expect(jobDispatchBlocker({ ...open, statusDisponibilidade: cell("ABERTA", true) })).toMatch(/não está aberta/)
    expect(jobDispatchBlocker({ ...open, statusAnalise: cell("DESCARTADA") })).toMatch(/não foi selecionada/)
  })
})

const searchProgress: DispatchProgress = {
  percent: 76,
  stages: [
    { key: "busca", label: "Busca", state: "done" },
    { key: "analise", label: "Análise", state: "done" },
    { key: "writeset", label: "Writeset", state: "done" },
    { key: "registro", label: "Registro", state: "active", note: "pendente de persistência" },
  ],
  writeset_job_ids: ["a", "b"],
  writeset_path: "runtime/operations/x/writeset.md",
}

describe("withRegistration", () => {
  it("keeps the registration stage pending while the Sheet lacks writeset jobs", () => {
    const partial = withRegistration(searchProgress, new Set(["a"]))
    expect(partial.stages[3]).toMatchObject({ state: "active", note: "writeset pendente: 1 de 2 na planilha" })
    expect(partial.percent).toBe(76)
  })

  it("closes the last stage at 100% once every writeset job is in the Sheet", () => {
    const done = withRegistration(searchProgress, new Set(["a", "b", "c"]))
    expect(done.stages[3]).toMatchObject({ state: "done", note: "2 de 2 na planilha" })
    expect(done.percent).toBe(100)
  })

  it("does nothing before the writeset exists", () => {
    const early = { ...searchProgress, writeset_path: null, writeset_job_ids: [] }
    expect(withRegistration(early, new Set(["a"]))).toBe(early)
  })
})

describe("schema", () => {
  it("requires jobId exactly for per-job actions and rejects extra fields", () => {
    expect(startInputSchema.safeParse({ action: "BUSCAR_VAGAS", platform: "hermes" }).success).toBe(true)
    expect(startInputSchema.safeParse({ action: "BUSCAR_VAGAS", platform: "hermes", jobId: "1" }).success).toBe(false)
    expect(startInputSchema.safeParse({ action: "GERAR_CURRICULO", platform: "grok" }).success).toBe(false)
    expect(startInputSchema.safeParse({ action: "GERAR_CURRICULO", platform: "grok", jobId: "../x" }).success).toBe(
      false
    )
    expect(
      startInputSchema.safeParse({ action: "PREENCHER_CANDIDATURA", platform: "hermes", jobId: "1", text: "ok" })
        .success
    ).toBe(false)
    expect(startInputSchema.safeParse({ action: "APROVAR", platform: "hermes" }).success).toBe(false)
  })

  it("parses a dispatcher record and picks the latest per action", () => {
    const raw = {
      id: "d-20260929T120000Z-abcdef",
      action: "GERAR_CURRICULO",
      platform: "hermes",
      job_id: "1",
      status: "RODANDO",
      code: null,
      marker: null,
      turns: 0,
      acknowledged: false,
      created_at: "2026-09-29T12:00:00Z",
      updated_at: "2026-09-29T12:00:00Z",
      delivered_at: null,
      finished_at: null,
      bot: "CVerino",
      active: true,
      progress: { percent: 5, stages: [], traffic: { pending: 0 }, handoff: null, cv: "MISSING" },
    }
    const parsed = dispatchSchema.parse(raw)
    const older: Dispatch = { ...parsed, id: "d-20260928T120000Z-abcdef" }
    expect(latest([parsed, older], "GERAR_CURRICULO")).toBe(parsed)
    expect(latest([parsed], "BUSCAR_VAGAS")).toBeNull()
  })
})

describe("refusalText", () => {
  it("explains known codes and falls back to the code", () => {
    expect(refusalText("GATEWAY_NOT_RUNNING")).toMatch(/Grok/)
    expect(refusalText("XYZ")).toBe("Disparo recusado (XYZ).")
  })
})
