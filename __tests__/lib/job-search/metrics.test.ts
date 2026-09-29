// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildJobSearchData } from "@/lib/job-search/build"
import {
  EMPTY_BUCKET,
  INVALID_BUCKET,
  analysesPerWeek,
  computeFunnel,
  computeKpis,
  coverageBySource,
  coverageByWeek,
  distribution,
  filterByPeriod,
  qualitySummary,
  sentInWeek,
  weekStart,
  weeklySeries,
} from "@/lib/job-search/metrics"
import { fixtureSnapshot } from "./helpers"

const data = buildJobSearchData(fixtureSnapshot(), "fixture", "now")

describe("KPIs and funnel", () => {
  it("counts the fixture", () => {
    expect(computeKpis(data.views)).toEqual({
      analisadas: 9,
      selecionadas: 8,
      abertas: 6,
      emPreparacao: 2,
      prontasRevisao: 1,
      enviadas: 1,
      envioIncerto: 1,
    })
    expect(computeFunnel(data.views).map((stage) => stage.count)).toEqual([9, 8, 6, 4, 1])
  })

  it("filters by first-analysis period", () => {
    const september = filterByPeriod(data.views, { from: "2026-09-01", to: "2026-09-30" })
    expect(september.map((view) => view.job.job_id)).toEqual([
      "fake-1001",
      "fake-1002",
      "fake-1003",
      "fake-1004",
      "fake-1007",
      "fake-1008",
    ])
    expect(filterByPeriod(data.views, {})).toHaveLength(9)
  })
})

describe("distribution", () => {
  it("buckets invalid and empty values explicitly", () => {
    const views = data.views.map((view) =>
      view.job.job_id === "fake-1001" ? { ...view, job: { ...view.job, setor: { invalid: "Mineração" } } } : view
    )
    expect(distribution(views, "setor")).toContainEqual({ value: INVALID_BUCKET, count: 1 })
    expect(distribution(data.views, "zona")).toContainEqual({ value: EMPTY_BUCKET, count: 6 })
    expect(distribution(data.views, "zona")[0]).toEqual({ value: EMPTY_BUCKET, count: 6 })
  })
})

describe("weekly series", () => {
  it("uses Monday-based weeks and fills gaps", () => {
    expect(weekStart("2026-09-25")).toBe("2026-09-21")
    expect(weekStart("2026-09-21")).toBe("2026-09-21")
    expect(weeklySeries(["2026-09-01", "2026-09-22", null])).toEqual([
      { week: "2026-08-31", count: 1 },
      { week: "2026-09-07", count: 0 },
      { week: "2026-09-14", count: 0 },
      { week: "2026-09-21", count: 1 },
    ])
    expect(weeklySeries([])).toEqual([])
  })

  it("aggregates analyses per week from the fixture", () => {
    const series = analysesPerWeek(data.views)
    expect(series.reduce((sum, point) => sum + point.count, 0)).toBe(9)
    expect(series[0].week).toBe("2026-08-17")
  })
})

describe("coverage", () => {
  it("summarizes per source and per week", () => {
    const bySource = coverageBySource(data.coverage)
    expect(bySource[0]).toMatchObject({ fonte: "LinkedIn", runs: 3, lastRun: "2026-09-24" })
    expect(bySource[0].counts.OK).toBe(2)
    expect(bySource[0].counts["CAPTCHA/BLOQUEIO"]).toBe(1)
    expect(coverageBySource(data.coverage, { from: "2026-09-20" }).map((row) => row.runs)).toEqual([1, 1])
    expect(coverageByWeek(data.coverage).map((week) => week.counts.OK)).toEqual([1, 1, 1])
  })
})

describe("qualitySummary", () => {
  it("counts analysis levels and affected jobs per issue code", () => {
    const summary = qualitySummary(data)
    expect(summary.analysis).toEqual({ FULL: 1, PARTIAL: 6, NONE: 1, INVALID: 1 })
    expect(summary.byCode.UNCERTAIN_SUBMIT).toBe(1)
    expect(summary.byCode.DOSSIER_INVALID).toBe(1)
    expect(summary.byCode.ENUM_INVALID).toBe(1)
    expect(summary.snapshotIssues).toBe(0)
  })
})

describe("sentInWeek", () => {
  it("counts applications dated in the ISO week of today, not after today", () => {
    // fake-1006 applied on Thursday 2026-09-03 (week of Monday 2026-08-31).
    expect(sentInWeek(data.views, "2026-09-03")).toBe(1)
    expect(sentInWeek(data.views, "2026-09-06")).toBe(1)
    expect(sentInWeek(data.views, "2026-08-31")).toBe(0)
    expect(sentInWeek(data.views, "2026-09-07")).toBe(0)
  })
})
