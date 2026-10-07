import { describe, expect, it } from "vitest"
import {
  attentionBadge,
  attentionEntries,
  attentionTitle,
  needsUserCount,
  newlyWaiting,
  waitingIds,
  type AttentionEntry,
} from "@/lib/ops/attention"
import type { AttentionItem } from "@/lib/ops/schema"

let n = 0
function item(over: Partial<AttentionItem>): AttentionItem {
  n += 1
  return {
    id: `d-20261007T2100${String(n).padStart(2, "0")}Z-abcdef`,
    action: "GERAR_CURRICULO",
    platform: "hermes",
    mode: "host",
    job_id: "4463543061",
    source_id: null,
    status: "PRECISA_HUMANO",
    code: "HUMAN_REVIEW_DOUBTS",
    created_at: "2026-10-07T21:00:00Z",
    finished_at: null,
    kind: "NEEDS_USER",
    ...over,
  }
}

const jobs = new Map([
  ["4463543061", { empresa: "Hatch", cargo: "Engenheiro de Processos Júnior" }],
  ["fake-1001", { empresa: "Acme", cargo: "Analista" }],
])

describe("attentionEntries", () => {
  it("names jobs from the snapshot, links searches to /cotar and puts what waits on the user first", () => {
    const running = item({ status: "RODANDO", kind: "RUNNING", code: null, job_id: "fake-1001" })
    const stuck = item({})
    const search = item({ action: "BUSCAR_VAGAS", job_id: null, status: "MANUAL", code: null })
    const entries = attentionEntries([running, stuck, search], jobs)
    expect(entries.map((entry) => [entry.id, entry.href, entry.empresa])).toEqual([
      [stuck.id, "/vaga/4463543061", "Hatch"],
      [search.id, "/cotar", null],
      [running.id, "/vaga/fake-1001", "Acme"],
    ])
    expect(needsUserCount(entries)).toBe(2)
  })

  it("drops a search writeset whose jobs are all in the Sheet (persisted outside the panel), like withRegistration", () => {
    const persisted = item({
      action: "BUSCAR_VAGAS",
      job_id: null,
      status: "CONCLUIDO",
      code: null,
      kind: "WRITESET_PENDING",
      writeset_job_ids: ["fake-1001"],
    })
    const pending = item({
      action: "BUSCAR_VAGAS",
      job_id: null,
      status: "CONCLUIDO",
      code: null,
      kind: "WRITESET_PENDING",
      writeset_job_ids: ["fake-1001", "novo"],
    })
    const analysis = item({
      action: "ANALISAR_VAGA",
      status: "CONCLUIDO",
      code: null,
      kind: "WRITESET_PENDING",
      writeset_job_ids: ["4463543061"],
    })
    expect(attentionEntries([persisted, pending, analysis], jobs).map((entry) => entry.id)).toEqual([
      pending.id,
      analysis.id,
    ])
  })

  it("encodes the job_id in the link and falls back to it as the title", () => {
    const [entry] = attentionEntries([item({ job_id: "gupy:12/x".replace("/", "") })], jobs)
    expect(entry.href).toBe("/vaga/gupy%3A12x")
    expect(attentionTitle(entry)).toBe("gupy:12x")
  })
})

describe("labels", () => {
  it("uses job-search's status label, and 'Falta registrar' for a pending writeset", () => {
    expect(attentionBadge({ kind: "NEEDS_USER", status: "PRECISA_HUMANO" })).toEqual({
      label: "Precisa de você",
      tone: "critical",
    })
    expect(attentionBadge({ kind: "NEEDS_USER", status: "INCERTO" }).label).toBe("Incerto")
    expect(attentionBadge({ kind: "RUNNING", status: "RODANDO" }).label).toBe("Rodando")
    expect(attentionBadge({ kind: "WRITESET_PENDING", status: "CONCLUIDO" })).toEqual({
      label: "Falta registrar",
      tone: "warning",
    })
    expect(attentionTitle({ action: "LOCALIZAR_VAGA", jobId: null, empresa: null })).toBe("Vaga específica")
  })
})

describe("newlyWaiting", () => {
  const entries: AttentionEntry[] = attentionEntries(
    [
      item({ id: "d-20261007T210001Z-aaaaaa" }),
      item({ id: "d-20261007T210002Z-bbbbbb", action: "BUSCAR_VAGAS", job_id: null, status: "MANUAL" }),
      item({ id: "d-20261007T210003Z-cccccc", kind: "RUNNING", status: "RODANDO" }),
    ],
    jobs
  )

  it("never toasts on the first read nor what was already waiting nor what runs", () => {
    expect(newlyWaiting(null, entries, "/")).toEqual([])
    expect(newlyWaiting(waitingIds(entries), entries, "/")).toEqual([])
    expect(newlyWaiting(new Set(), entries, "/").map((entry) => entry.id)).toEqual([
      "d-20261007T210001Z-aaaaaa",
      "d-20261007T210002Z-bbbbbb",
    ])
  })

  it("skips what the current page already shows", () => {
    expect(newlyWaiting(new Set(), entries, "/vaga/4463543061").map((entry) => entry.id)).toEqual([
      "d-20261007T210002Z-bbbbbb",
    ])
    expect(newlyWaiting(new Set(), entries, "/cotar").map((entry) => entry.id)).toEqual(["d-20261007T210001Z-aaaaaa"])
  })
})
