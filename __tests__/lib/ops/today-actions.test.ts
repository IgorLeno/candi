import { beforeEach, describe, expect, it, vi } from "vitest"

const local = vi.hoisted(() => ({ current: true }))
const runDispatcher = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth/local-request", () => ({ isLocalRequest: vi.fn(async () => local.current) }))
vi.mock("@/lib/ops/dispatcher", () => ({ runDispatcher }))
vi.mock("@/lib/job-search/source", () => ({
  JOB_SEARCH_CACHE_TAG: "job-search",
  getJobSearchData: vi.fn(async () => ({ views: [] })),
}))
vi.mock("next/cache", () => ({ updateTag: vi.fn() }))

import { getTodaySettings, pinTodayJob, saveTodaySettings, unpinTodayJob } from "@/app/actions/ops"

const settings = {
  schema: "today-settings/1",
  auto: { enabled: false, every_hours: 12 },
  focus: { cargo: "", lugar: "" },
  replace: "AVALIAR",
  pinned: [],
  updated_at: null,
}

describe("Hoje settings server actions (plan 2026-10-22)", () => {
  beforeEach(() => {
    local.current = true
    runDispatcher.mockReset()
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, settings, next_run_at: null, today: null } })
  })

  it("require a local request before anything else (the proxy does not cover Server Functions)", async () => {
    local.current = false
    await expect(getTodaySettings()).rejects.toThrow("NOT_LOCAL")
    await expect(saveTodaySettings({ replace: "AVALIAR", focus: { cargo: "", lugar: "" } })).rejects.toThrow(
      "NOT_LOCAL"
    )
    await expect(pinTodayJob("fake-1001")).rejects.toThrow("NOT_LOCAL")
    await expect(unpinTodayJob("fake-1001")).rejects.toThrow("NOT_LOCAL")
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("reads the settings with the fixed command", async () => {
    await expect(getTodaySettings()).resolves.toEqual({ ok: true, value: { settings, next_run_at: null } })
    expect(runDispatcher.mock.calls[0][0]).toEqual(["today-settings"])
  })

  it("saves with fixed flags and sends the focus only over stdin, never argv", async () => {
    await saveTodaySettings({ replace: "2", focus: { cargo: " analista​ de processos ", lugar: "--auto on" } })
    const [args, , config, options] = runDispatcher.mock.calls[0]
    expect(args).toEqual(["today-settings", "set", "--replace", "2", "--focus-stdin"])
    expect(config).toBeUndefined()
    expect(JSON.parse(options.stdin)).toEqual({ cargo: "analista de processos", lugar: "--auto on" })
  })

  it("refuses bad input here, without calling the dispatcher", async () => {
    for (const input of [
      null,
      { replace: "4", focus: { cargo: "", lugar: "" } },
      { replace: "AVALIAR" },
      { replace: "AVALIAR", focus: { cargo: "", lugar: "" }, auto: "on" },
      { replace: "AVALIAR", focus: { cargo: 1, lugar: "" } },
    ]) {
      await expect(saveTodaySettings(input)).resolves.toEqual({ ok: false, code: "INPUT_INVALID" })
    }
    await expect(
      saveTodaySettings({ replace: "AVALIAR", focus: { cargo: "ok 1a2b3c4d", lugar: "" } })
    ).resolves.toEqual({ ok: false, code: "FOCUS_INVALID" })
    for (const id of [null, "--all", "a b", "../x", ["fake-1001"]]) {
      await expect(pinTodayJob(id)).resolves.toEqual({ ok: false, code: "INPUT_INVALID" })
      await expect(unpinTodayJob(id)).resolves.toEqual({ ok: false, code: "INPUT_INVALID" })
    }
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("pins and unpins with only a validated job_id and passes refusals through", async () => {
    await pinTodayJob("fake-1001")
    await unpinTodayJob("fake-1001")
    expect(runDispatcher.mock.calls.map((call) => call[0])).toEqual([
      ["today-pin", "fake-1001"],
      ["today-unpin", "fake-1001"],
    ])
    runDispatcher.mockResolvedValue({ ok: false, code: "PIN_FULL", detail: "x" })
    await expect(pinTodayJob("fake-1002")).resolves.toEqual({ ok: false, code: "PIN_FULL" })
  })
})
