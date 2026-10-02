// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { getAllowedSession } from "@/lib/auth/session"
import { dataSource, getJobSearchData } from "@/lib/job-search/source"

// The real module needs the Next request scope; tests control the session directly.
vi.mock("@/lib/auth/session", () => ({ getAllowedSession: vi.fn(async () => null) }))
// `unstable_cache` needs Next's incremental cache; these tests cover the gates, not caching.
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("dataSource", () => {
  it("reads the real Sheet only on explicit opt-in", () => {
    expect(dataSource({})).toBe("fixture")
    expect(dataSource({ JOB_SEARCH_DATA_SOURCE: "fixture" })).toBe("fixture")
    expect(dataSource({ JOB_SEARCH_DATA_SOURCE: "Sheets" })).toBe("fixture")
    expect(dataSource({ JOB_SEARCH_DATA_SOURCE: "sheets" })).toBe("sheets")
  })
})

describe("getJobSearchData", () => {
  it("serves the fixture without network access by default", async () => {
    vi.stubEnv("JOB_SEARCH_DATA_SOURCE", "")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const data = await getJobSearchData()
    expect(data.source).toBe("fixture")
    expect(data.views).toHaveLength(11)
    expect(fetchSpy).not.toHaveBeenCalled()
    // Server Component props must survive JSON serialization unchanged.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
  })

  it("refuses the real Sheet without an allowed session, before any network access", async () => {
    vi.stubEnv("JOB_SEARCH_DATA_SOURCE", "sheets")
    vi.stubEnv("JOB_SEARCH_SHEET_ID", "sheet-id")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(getJobSearchData()).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    expect(getAllowedSession).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("reads the Sheet once the session is allowed", async () => {
    vi.mocked(getAllowedSession).mockResolvedValueOnce({ user: { email: "owner@example.com" }, expires: "" })
    vi.stubEnv("JOB_SEARCH_DATA_SOURCE", "sheets")
    vi.stubEnv("JOB_SEARCH_SHEET_ID", "")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    // Passes the session gate and stops at the next check, without network access.
    await expect(getJobSearchData()).rejects.toMatchObject({ code: "SHEET_ID_MISSING" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
