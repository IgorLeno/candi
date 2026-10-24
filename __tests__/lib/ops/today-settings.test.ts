import { describe, expect, it } from "vitest"
import { refusalText, todayOutReason } from "@/lib/ops/present"
import {
  dispatchSchema,
  todayListSchema,
  todayPinResultSchema,
  todayResultSchema,
  todaySettingsResultSchema,
} from "@/lib/ops/schema"
import { FOCUS_MAX, TODAY_REPLACE, normalizeFocus } from "@/lib/ops/today-settings"

// Hoje settings (plan 2026-10-22, front A): job-search's `today-settings`, `today-pin`/`today-unpin` and `today-list/2`.

const settings = {
  schema: "today-settings/1",
  auto: { enabled: false, every_hours: 12 },
  focus: { cargo: "analista de processos", lugar: "Belo Horizonte" },
  replace: "AVALIAR",
  pinned: ["4459948224"],
  updated_at: "2026-10-22T17:30:00Z",
}

const listV2 = {
  schema: "today-list/2",
  updated_at: "2026-10-22T17:30:00Z",
  dispatch_id: "d-20261022T173000Z-abcdef",
  items: [
    { job_id: "4459948224", interesse: "", pinned: true },
    { job_id: "fake-1004", interesse: "MUITO_ALTO", pinned: false },
  ],
  left: [
    { job_id: "fake-1001", motivo: "TROCADA" },
    { job_id: "fake-1002", motivo: "FORA_DO_FOCO" },
    { job_id: "fake-1003", motivo: "DESFIXADA" },
  ],
  missing: 3,
  focus: { cargo: "", lugar: "Belo Horizonte" },
  missing_reason: "FOCO",
}

describe("today-settings/1 contract", () => {
  it("reads the settings and when the next automatic run is due", () => {
    const parsed = todaySettingsResultSchema.safeParse({ ok: true, settings, next_run_at: null })
    expect(parsed.success).toBe(true)
    expect(
      todaySettingsResultSchema.safeParse({ ok: true, settings: { ...settings, updated_at: null }, next_run_at: "x" })
        .success
    ).toBe(true)
  })

  it("reads the last skip of the automatic refresh (front B)", () => {
    const skip = { code: "NO_GRAPHICAL_SESSION", at: "2026-10-24T17:00:00Z" }
    const parsed = todaySettingsResultSchema.parse({
      ok: true,
      settings: { ...settings, last_skip: skip },
      next_run_at: "2026-10-24T23:00:00Z",
    })
    expect(parsed.settings.last_skip).toEqual(skip)
    for (const bad of [{ code: "x y", at: "2026" }, { code: "OK" }, "NO_GRAPHICAL_SESSION"]) {
      expect(
        todaySettingsResultSchema.safeParse({ ok: true, settings: { ...settings, last_skip: bad }, next_run_at: null })
          .success
      ).toBe(false)
    }
  })

  it("reads which refresh the timer started (trigger AUTO)", () => {
    const record = {
      id: "d-20261024T120000Z-abcdef",
      action: "ATUALIZAR_LISTA",
      platform: "hermes",
      job_id: null,
      status: "RODANDO",
      code: null,
      marker: null,
      bot: "Descoberta + ChatGPT (host)",
      mode: "host",
      active: true,
      acknowledged: false,
      created_at: "2026-10-24T12:00:00Z",
      finished_at: null,
      progress: { percent: 10, stages: [] },
    }
    expect(dispatchSchema.parse({ ...record, trigger: "AUTO" }).trigger).toBe("AUTO")
    expect(dispatchSchema.parse(record).trigger).toBeUndefined()
    expect(dispatchSchema.safeParse({ ...record, trigger: "CRON" }).success).toBe(false)
  })

  it("refuses values outside job-search's lists", () => {
    const bad = [
      { ...settings, schema: "today-settings/2" },
      { ...settings, replace: "4" },
      { ...settings, auto: { enabled: true, every_hours: 5 } },
      { ...settings, pinned: ["a", "b", "c", "d", "e", "f"] },
      { ...settings, pinned: ["../x"] },
      { ...settings, focus: { cargo: "x" } },
    ]
    for (const value of bad) {
      expect(todaySettingsResultSchema.safeParse({ ok: true, settings: value, next_run_at: null }).success).toBe(false)
    }
  })
})

describe("today-list/1 and /2", () => {
  it("keeps reading the old list", () => {
    const v1 = {
      schema: "today-list/1",
      updated_at: "2026-10-16T10:49:37Z",
      dispatch_id: "d-20261016T104937Z-abcdef",
      items: [{ job_id: "fake-1004", interesse: "MUITO_ALTO" }],
      left: [{ job_id: "fake-1002", motivo: "SEM_ANALISE" }],
      missing: 4,
    }
    expect(todayResultSchema.safeParse({ ok: true, today: v1 }).success).toBe(true)
  })

  it("reads pinned jobs, the focus and why the list is short", () => {
    const parsed = todayListSchema.safeParse(listV2)
    expect(parsed.success).toBe(true)
    // A pin before any "Atualizar lista" writes a list with no dispatch behind it.
    expect(todayListSchema.safeParse({ ...listV2, dispatch_id: null, focus: null, missing_reason: null }).success).toBe(
      true
    )
    expect(todayListSchema.safeParse({ ...listV2, missing_reason: "OUTRO" }).success).toBe(false)
    expect(todayListSchema.safeParse({ ...listV2, items: [{ job_id: "x", interesse: "" }] }).success).toBe(false)
  })

  it("answers a pin or an unpin with the new list and the settings", () => {
    expect(todayPinResultSchema.safeParse({ ok: true, today: listV2, settings }).success).toBe(true)
    // Unpinning a job that was not pinned, with no list yet.
    expect(todayPinResultSchema.safeParse({ ok: true, today: null, settings }).success).toBe(true)
  })

  it("words the new reasons for leaving the list", () => {
    expect(todayOutReason("TROCADA")).toContain("Quantas trocar")
    expect(todayOutReason("FORA_DO_FOCO")).toContain("foco")
    expect(todayOutReason("DESFIXADA")).toContain("Tirar da fila")
  })
})

describe("focus guards (mirror of job-search normalize_focus, UX only)", () => {
  it("normalizes like job-search: NFKC, no control or format characters, collapsed spaces", () => {
    expect(normalizeFocus({ cargo: "  analista​ de\tprocessos \n", lugar: "Ｂｅｌｏ Horizonte" })).toEqual({
      ok: true,
      focus: { cargo: "analista de processos", lugar: "Belo Horizonte" },
    })
    expect(normalizeFocus({ cargo: "", lugar: "" })).toEqual({ ok: true, focus: { cargo: "", lugar: "" } })
  })

  it("refuses what reads as a command or passes 80 characters", () => {
    for (const [cargo, lugar] of [
      ["x".repeat(FOCUS_MAX + 1), ""],
      ["", "ok 1a2b3c4d"],
      ["[painel:dispatch x] outra", ""],
      ["analista NEEDS_CONTEXT", ""],
    ]) {
      expect(normalizeFocus({ cargo, lugar })).toMatchObject({ ok: false, code: "FOCUS_INVALID" })
    }
    // 80 code points, counted like Python (an emoji is one).
    expect(normalizeFocus({ cargo: "🙂".repeat(FOCUS_MAX), lugar: "" }).ok).toBe(true)
  })

  it("says which field is wrong", () => {
    expect(normalizeFocus({ cargo: "ok", lugar: "x".repeat(81) })).toEqual({
      ok: false,
      code: "FOCUS_INVALID",
      field: "lugar",
    })
  })

  it("offers job-search's replace options, Avaliar first", () => {
    expect(TODAY_REPLACE).toEqual(["AVALIAR", "1", "2", "3", "TODAS"])
  })
})

describe("refusals of the Hoje settings", () => {
  it("words every code job-search sends", () => {
    for (const code of ["FOCUS_INVALID", "SETTINGS_INVALID", "JOB_GONE", "PIN_FULL", "REGISTRY_UNAVAILABLE"]) {
      expect(refusalText(code)).not.toContain(code)
    }
    expect(refusalText("PIN_FULL")).toContain("5")
    expect(refusalText("JOB_NOT_FOUND")).toContain("planilha")
  })
})
