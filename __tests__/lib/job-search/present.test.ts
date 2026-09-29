// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildJobSearchData } from "@/lib/job-search/build"
import { INVALID_BUCKET } from "@/lib/job-search/metrics"
import {
  DEFAULT_FILTERS,
  attentionGroups,
  facetOptions,
  flameCount,
  jobState,
  journeyStep,
  todayQueue,
  filtersToParams,
  formatDay,
  formatTimestamp,
  jobHref,
  listHref,
  matchesFilters,
  parseFilters,
  parsePeriod,
  periodRange,
  safeHttpUrl,
  sortJobs,
  toListItem,
  type JobFilters,
} from "@/lib/job-search/present"
import { fixtureSnapshot } from "./helpers"

const data = buildJobSearchData(fixtureSnapshot(), "fixture", "now")
const items = data.views.map(toListItem)
const byId = (id: string) => items.find((item) => item.jobId === id)!

function ids(filters: Partial<JobFilters>): string[] {
  const merged = { ...DEFAULT_FILTERS, ...filters }
  return sortJobs(
    items.filter((item) => matchesFilters(item, merged)),
    merged.sort
  ).map((item) => item.jobId)
}

describe("toListItem", () => {
  it("projects a slim row without posting or dossier body", () => {
    const item = byId("fake-1001")
    expect(item.coreSentence).toBe("acompanhar processos produtivos, analisar parâmetros e desvios")
    expect(item.local).toBe("Belo Horizonte/MG")
    expect(item.analysis).toBe("FULL")
    expect(item.interesse).toEqual({ value: "MUITO_ALTO", invalid: false, tone: "neutral" })
    expect(JSON.stringify(item)).not.toContain("Programa formal de rotação")
  })

  it("keeps an out-of-domain value as invalid text, bucketed as INVÁLIDO", () => {
    const item = byId("fake-1005")
    expect(item.statusCandidatura).toEqual({ value: "NãO INICIADA", invalid: true, tone: "warning" })
    expect(item.facets.status_candidatura).toBe(INVALID_BUCKET)
    expect(item.issueCodes).toContain("ENUM_INVALID")
  })

  it("hides the core sentence of an invalid dossier", () => {
    expect(byId("fake-1004").analysis).toBe("INVALID")
    expect(byId("fake-1004").coreSentence).toBeNull()
  })
})

describe("filters", () => {
  it("filters by facet, including the invalid bucket", () => {
    expect(ids({ facets: { analysis: "INVALID" } })).toEqual(["fake-1004"])
    expect(ids({ facets: { status_candidatura: INVALID_BUCKET } })).toEqual(["fake-1005"])
    expect(ids({ facets: { interesse: "MUITO_ALTO", analysis: "PARTIAL" } })).toEqual(["fake-1002"])
  })

  it("searches empresa/cargo/job_id ignoring case and accents", () => {
    expect(ids({ q: "QUIMICA exemplo" })).toEqual(["fake-1006"])
    expect(ids({ q: "fake-100" })).toHaveLength(8)
    // Core sentence is searchable only when the dossier is valid (fake-1004 is not).
    expect(ids({ q: "parametros" })).toEqual(["fake-1001", "fake-1002", "fake-1003"])
  })

  it("filters uncertain submits, data problems and archive", () => {
    expect(ids({ envioIncerto: true })).toEqual(["fake-1007"])
    expect(ids({ arquivo: "encerradas" })).toEqual(["fake-0999"])
    expect(ids({ arquivo: "ativas" })).not.toContain("fake-0999")
    expect(ids({ comProblema: true })).toContain("fake-1003")
  })

  it("sorts by interest ladder, then most recent analysis", () => {
    expect(ids({}).slice(0, 3)).toEqual(["fake-1001", "fake-1004", "fake-1002"])
    expect(ids({}).at(-1)).toBe("fake-1005")
    expect(ids({ sort: "recentes" })[0]).toBe("fake-1001")
  })

  it("round-trips through URL params and ignores unknown values", () => {
    const filters: JobFilters = {
      q: "exemplo",
      facets: { interesse: "ALTO", analysis: "NONE" },
      arquivo: "ativas",
      envioIncerto: true,
      comProblema: false,
      sort: "recentes",
    }
    const params = Object.fromEntries(filtersToParams(filters))
    expect(parseFilters(params)).toEqual(filters)
    expect(parseFilters({ arquivo: "x", ordem: "y", foo: "bar" })).toEqual(DEFAULT_FILTERS)
  })

  it("offers the contract domain plus values present in the data", () => {
    const options = facetOptions(items, "status_candidatura")
    expect(options.slice(0, 6)).toEqual([
      "NÃO INICIADA",
      "EM PREPARAÇÃO",
      "PRONTA PARA REVISÃO",
      "ENVIADA",
      "ENVIO INCERTO",
      "RETIRADA",
    ])
    expect(options).toContain(INVALID_BUCKET)
    expect(facetOptions(items, "fonte_descoberta")).toEqual(["LinkedIn"])
  })

  it("builds list links", () => {
    expect(listHref({})).toBe("/vagas")
    expect(listHref({ status_candidatura: "PRONTA PARA REVISÃO" })).toBe(
      "/vagas?status_candidatura=PRONTA+PARA+REVIS%C3%83O"
    )
    expect(jobHref("a:b/c")).toBe("/vaga/a%3Ab%2Fc")
  })
})

describe("attention groups", () => {
  it("surfaces uncertain submit first and drops empty groups", () => {
    const groups = attentionGroups(data.views)
    expect(groups[0]).toMatchObject({ id: "envio-incerto", tone: "critical" })
    expect(groups[0].jobs.map((job) => job.jobId)).toEqual(["fake-1007"])
    expect(Object.fromEntries(groups.map((group) => [group.id, group.jobs.length]))).toEqual({
      "envio-incerto": 1,
      "dossier-invalido": 1,
      "pronta-revisao": 1,
      divergencia: 1,
      "valor-invalido": 1,
      "sem-dossier": 4,
    })
    expect(attentionGroups([])).toEqual([])
  })
})

describe("safety and formatting", () => {
  it("only turns http(s) URLs into links", () => {
    expect(safeHttpUrl("https://jobs.example.invalid/x")).toBe("https://jobs.example.invalid/x")
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull()
    expect(safeHttpUrl("data:text/html,x")).toBeNull()
    expect(safeHttpUrl("not a url")).toBeNull()
    expect(safeHttpUrl("")).toBeNull()
  })

  it("formats dates in UTC and passes unknown text through", () => {
    expect(formatDay("2026-09-03")).toBe("03/09/2026")
    expect(formatDay(null)).toBe("—")
    expect(formatTimestamp("2026-09-03T09:00:30Z")).toBe("03/09/2026 09:00 UTC")
    expect(formatTimestamp("ontem")).toBe("ontem")
  })

  it("parses periods into inclusive windows", () => {
    expect(parsePeriod("30d")).toBe("30d")
    expect(parsePeriod("7d")).toBe("tudo")
    expect(periodRange("tudo", "2026-09-25")).toEqual({})
    expect(periodRange("30d", "2026-09-25")).toEqual({ from: "2026-08-27", to: "2026-09-25" })
  })
})

describe("visual state", () => {
  it("maps each fixture job to one state, most decisive first", () => {
    const states = Object.fromEntries(items.map((item) => [item.jobId, jobState(item)]))
    expect(states).toEqual({
      "fake-1001": "aberta",
      "fake-1002": "aberta",
      "fake-1003": "revisao",
      "fake-1004": "aberta",
      "fake-1005": "fora",
      "fake-1006": "enviada",
      "fake-1007": "incerto",
      "fake-1008": "nao-confirmada",
      "fake-0999": "encerrada",
    })
  })

  it("never reads an invalid cell as a state value", () => {
    const base = byId("fake-1001")
    const invalid = { value: "ENVIADA ", invalid: true, tone: "warning" as const }
    expect(jobState({ ...base, statusCandidatura: invalid })).toBe("aberta")
    expect(journeyStep(invalid)).toBeNull()
  })

  it("trail and flames follow the job-search ladders, null outside them", () => {
    expect(journeyStep(byId("fake-1002").statusCandidatura)).toBe(0)
    expect(journeyStep(byId("fake-1001").statusCandidatura)).toBe(1)
    expect(journeyStep(byId("fake-1003").statusCandidatura)).toBe(2)
    expect(journeyStep(byId("fake-1006").statusCandidatura)).toBe(3)
    expect(journeyStep({ value: "RETIRADA", invalid: false, tone: "muted" })).toBeNull()
    expect(flameCount(byId("fake-1001").interesse)).toBe(3)
    expect(flameCount(byId("fake-1003").interesse)).toBe(0)
    expect(flameCount(byId("fake-1005").interesse)).toBeNull()
  })

  it("queues selected open jobs still to apply, by interest, progress, then recency", () => {
    expect(todayQueue(items).map((item) => item.jobId)).toEqual(["fake-1001", "fake-1004", "fake-1002", "fake-1003"])
  })
})
