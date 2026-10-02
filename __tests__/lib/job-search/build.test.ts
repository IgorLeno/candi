// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildJobSearchData, hasUncertainSubmit } from "@/lib/job-search/build"
import type { ApplicationEvent, JobView } from "@/lib/job-search/types"
import { fixtureSnapshot } from "./helpers"

const data = buildJobSearchData(fixtureSnapshot(), "fixture", "2026-09-25T00:00:00Z")
const view = (jobId: string): JobView => {
  const found = data.views.find((item) => item.job.job_id === jobId)
  if (!found) throw new Error(`missing ${jobId}`)
  return found
}
const codes = (jobId: string) => view(jobId).issues.map((issue) => issue.code)

describe("buildJobSearchData on the job-search fixture", () => {
  it("finds the main tab by header and skips rows without job_id", () => {
    expect(data.mainTab).toBe("Registro")
    expect(data.views.map((item) => item.job.job_id)).toEqual([
      "fake-1001",
      "fake-1002",
      "fake-1003",
      "fake-1004",
      "fake-1005",
      "fake-1006",
      "fake-1007",
      "fake-1008",
      "fake-1009",
      "fake-1010",
      "fake-0999",
    ])
    expect(data.dossiersTabPresent).toBe(true)
    expect(data.issues).toEqual([])
  })

  it("marks a valid, untruncated, consistent dossier as FULL and uses the latest row", () => {
    const full = view("fake-1001")
    expect(full.analysis).toBe("FULL")
    expect(full.dossierRows).toBe(2)
    expect(full.dossier?.captured_at).toBe("2026-09-24T10:00:00Z")
    expect(full.dossier?.dossier?.interest.level).toBe("MUITO_ALTO")
    expect(full.zona).toBe("BH_RMBH")
    expect(full.modalidade).toBe("PRESENCIAL")
    expect(full.requirementsByEvidence?.["ADERÊNCIA REAL"]).toHaveLength(2)
    expect(full.requirementsByEvidence?.["LACUNA"]).toHaveLength(1)
    expect(full.actionable).toBe(true)
    expect(full.issues).toEqual([])
  })

  it("downgrades to PARTIAL when the posting was truncated", () => {
    const truncated = view("fake-1002")
    expect(truncated.analysis).toBe("PARTIAL")
    expect(truncated.dossier?.posting_truncated).toBe(true)
    expect(truncated.dossier?.valid).toBe(true)
    expect(codes("fake-1002")).toContain("DOSSIER_POSTING_TRUNCATED")
  })

  it("flags Sheet × dossier divergence without resolving it", () => {
    const divergent = view("fake-1003")
    expect(divergent.analysis).toBe("PARTIAL")
    expect(divergent.divergences).toEqual([
      { field: "interesse", sheet: "BAIXO", dossier: divergent.dossier?.dossier?.interest.level },
    ])
    expect(divergent.job.interesse).toBe("BAIXO")
  })

  it("treats a dossier whose sha256 does not match as INVALID and hides its content", () => {
    const tampered = view("fake-1004")
    expect(tampered.analysis).toBe("INVALID")
    expect(tampered.dossier?.integrity).toBe(false)
    expect(tampered.dossier?.dossier).toBeNull()
    expect(codes("fake-1004")).toContain("DOSSIER_INVALID")
  })

  it("keeps out-of-domain enums visible as invalid and historical rows as NONE", () => {
    const legacy = view("fake-1005")
    expect(legacy.analysis).toBe("NONE")
    expect(legacy.job.status_candidatura).toEqual({ invalid: "NãO INICIADA" })
    expect(legacy.issues).toContainEqual(expect.objectContaining({ code: "ENUM_INVALID", field: "status_candidatura" }))
    expect(codes("fake-1005")).toContain("NOT_CLASSIFIED")
  })

  it("orders events and treats a SUBMIT_INTENT without outcome as uncertain submit", () => {
    expect(view("fake-1006").events.map((event) => event.evento)).toEqual([
      "CLAIMED",
      "DRAFT_CONFIRMED",
      "SUBMIT_INTENT",
      "SUBMITTED",
    ])
    expect(view("fake-1006").uncertainSubmit).toBe(false)
    expect(view("fake-1007").uncertainSubmit).toBe(true)
    expect(codes("fake-1007")).toContain("UNCERTAIN_SUBMIT")
  })

  it("flags SELECIONADA without dossier and keeps Sheet classification as PARTIAL", () => {
    expect(view("fake-1008").analysis).toBe("PARTIAL")
    expect(codes("fake-1008")).toContain("SELECTED_WITHOUT_DOSSIER")
  })

  it("reads the Encerradas tab as archived rows", () => {
    expect(view("fake-0999").job.archived).toBe(true)
    expect(view("fake-0999").actionable).toBe(false)
    expect(view("fake-1001").job.archived).toBe(false)
  })
})

describe("snapshot-level robustness", () => {
  it("reports a missing Dossiers tab without failing", () => {
    const raw = fixtureSnapshot()
    delete raw.tabs["Dossiers"]
    const result = buildJobSearchData(raw, "fixture", "now")
    expect(result.dossiersTabPresent).toBe(false)
    expect(result.views.every((item) => item.dossier === null)).toBe(true)
    expect(result.views.find((item) => item.job.job_id === "fake-1001")?.analysis).toBe("PARTIAL")
    expect(result.issues).toEqual([])
  })

  it("flags duplicated job_id and orphan dossiers/events", () => {
    const raw = fixtureSnapshot()
    const main = raw.tabs["Registro"]
    const jobIdCol = main[0].indexOf("job_id")
    main[main.length - 1][jobIdCol] = "fake-1001"
    raw.tabs["Registro"] = main.filter((row) => row[jobIdCol] !== "fake-1004" && row[jobIdCol] !== "fake-1006")
    const result = buildJobSearchData(raw, "fixture", "now")
    expect(result.views.filter((item) => item.job.job_id === "fake-1001")).toHaveLength(1)
    expect(result.views.find((item) => item.job.job_id === "fake-1001")?.issues.map((i) => i.code)).toContain(
      "DUPLICATE_JOB_ID"
    )
    expect(result.orphanDossiers.map((record) => record.job_id)).toEqual(["fake-1004"])
    expect(result.issues.map((issue) => issue.code)).toEqual(["ORPHAN_DOSSIER", "ORPHAN_EVENT"])
  })

  it("detects drift between Valores Permitidos and the mirrored domains", () => {
    const raw = fixtureSnapshot()
    const allowed = raw.tabs["Valores Permitidos"]
    const col = allowed[0].indexOf("status_candidatura")
    allowed[1][col] = "NãO INICIADA"
    const result = buildJobSearchData(raw, "fixture", "now")
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "ALLOWED_VALUES_DRIFT", field: "status_candidatura" }),
    ])
  })

  it("reports a missing main tab", () => {
    const raw = fixtureSnapshot()
    delete raw.tabs["Registro"]
    const result = buildJobSearchData(raw, "fixture", "now")
    expect(result.mainTab).toBeNull()
    expect(result.issues.map((issue) => issue.code)).toContain("MAIN_TAB_NOT_FOUND")
  })
})

describe("hasUncertainSubmit", () => {
  const event = (evento: string, attempt = "a:1", row = 2): ApplicationEvent => ({
    job_id: "a",
    attempt_id: attempt,
    evento: evento as ApplicationEvent["evento"],
    timestamp: "",
    submit_mode: null,
    fingerprint8: "",
    evidencia: "",
    row,
  })

  it("is resolved by a later outcome in the same attempt only", () => {
    expect(hasUncertainSubmit([event("SUBMIT_INTENT"), event("SUBMITTED")])).toBe(false)
    expect(hasUncertainSubmit([event("SUBMIT_INTENT"), event("CLOSED")])).toBe(false)
    expect(hasUncertainSubmit([event("SUBMIT_INTENT", "a:1"), event("SUBMITTED", "a:2")])).toBe(true)
    expect(hasUncertainSubmit([event("SUBMIT_INTENT"), event("SUBMIT_UNCERTAIN")])).toBe(true)
    expect(hasUncertainSubmit([event("CLAIMED")])).toBe(false)
  })
})
