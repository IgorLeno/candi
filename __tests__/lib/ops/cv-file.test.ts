import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ current: null as null | { user: { email: string } } }))
const runDispatcher = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth/session", () => ({ getAllowedSession: vi.fn(async () => session.current) }))
vi.mock("@/lib/ops/dispatcher", () => ({ runDispatcher, isDispatchEnabled: () => true }))
vi.mock("@/lib/job-search/source", () => ({ JOB_SEARCH_CACHE_TAG: "job-search", getJobSearchData: vi.fn() }))
vi.mock("next/cache", () => ({ updateTag: vi.fn() }))

import { readCvPdf } from "@/lib/ops/cv-file"
import { getCvFile } from "@/app/actions/ops"
import { GET } from "@/app/api/vaga/[job_id]/curriculo/route"
import { cvFileText } from "@/lib/ops/present"

const BYTES = Buffer.from("%PDF-1.4 currículo de teste")

function pdfOnDisk(bytes = BYTES) {
  const dir = mkdtempSync(path.join(tmpdir(), "cv-file-"))
  const file = path.join(dir, "curriculo_igor-fernandes_pt_acme.pdf")
  writeFileSync(file, bytes)
  return {
    job_id: "4466682591",
    path: file,
    filename: "curriculo_igor-fernandes_pt_acme.pdf",
    size: bytes.length,
    sha256: createHash("sha256").update(BYTES).digest("hex"),
    exported_at: "2026-10-03T12:00:00Z",
  }
}

const params = (jobId: string) => ({ params: Promise.resolve({ job_id: jobId }) })

describe("résumé PDF for the job page", () => {
  beforeEach(() => {
    session.current = { user: { email: "owner@e2e.test" } }
    runDispatcher.mockReset()
  })

  it("asks job-search which file, with the job_id only", async () => {
    const file = pdfOnDisk()
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, cv_file: file } })
    const pdf = await readCvPdf("4466682591")
    expect(runDispatcher).toHaveBeenCalledWith(["cv-file", "4466682591"], expect.anything())
    expect(pdf.ok && pdf.bytes.equals(BYTES)).toBe(true)
  })

  it("never calls the dispatcher with an invalid job_id", async () => {
    expect(await readCvPdf("../etc/passwd")).toEqual({ ok: false, code: "INPUT_INVALID" })
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("refuses a file swapped after job-search checked it", async () => {
    const file = pdfOnDisk(Buffer.from("%PDF-1.4 outro conteúdo"))
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, cv_file: file } })
    expect(await readCvPdf("4466682591")).toEqual({ ok: false, code: "CV_NOT_VALID", detail: "PDF_HASH_MISMATCH" })
  })

  it("refuses a path whose name is not the registered file", async () => {
    const file = { ...pdfOnDisk(), filename: "curriculo_igor-fernandes_pt_outra.pdf" }
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, cv_file: file } })
    expect(await readCvPdf("4466682591")).toEqual({ ok: false, code: "CV_PATH_INVALID" })
  })

  it("passes job-search's refusal and detail through", async () => {
    runDispatcher.mockResolvedValue({ ok: false, code: "CV_NOT_VALID", detail: "CV_JSON_MISSING" })
    expect(await readCvPdf("4466682591")).toEqual({ ok: false, code: "CV_NOT_VALID", detail: "CV_JSON_MISSING" })
  })

  it("route: 401 without session, PDF inline with session, JSON refusal otherwise", async () => {
    session.current = null
    expect((await GET(new Request("http://x"), params("4466682591"))).status).toBe(401)
    expect(runDispatcher).not.toHaveBeenCalled()
    session.current = { user: { email: "owner@e2e.test" } }
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, cv_file: pdfOnDisk() } })
    const ok = await GET(new Request("http://x"), params("4466682591"))
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toBe("application/pdf")
    expect(ok.headers.get("content-disposition")).toBe('inline; filename="curriculo_igor-fernandes_pt_acme.pdf"')
    expect(Buffer.from(await ok.arrayBuffer()).equals(BYTES)).toBe(true)
    runDispatcher.mockResolvedValue({ ok: false, code: "CV_NOT_VALID", detail: "CV_JSON_MISSING" })
    expect((await GET(new Request("http://x"), params("4466682591"))).status).toBe(404)
  })

  it("action: never sends the file path to the client", async () => {
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, cv_file: pdfOnDisk() } })
    const result = await getCvFile("4466682591")
    expect(result.ok && Object.keys(result.value).sort()).toEqual([
      "exported_at",
      "filename",
      "job_id",
      "sha256",
      "size",
    ])
    session.current = null
    await expect(getCvFile("4466682591")).rejects.toThrow("UNAUTHENTICATED")
  })

  it("explains why there is no PDF", () => {
    expect(cvFileText("CV_NOT_VALID", "CV_JSON_MISSING")).toMatch(/Ainda não há currículo/)
    expect(cvFileText("CV_NOT_VALID", "PDF_HASH_MISMATCH")).toMatch(/não está mais na pasta/)
    expect(cvFileText("CV_NOT_VALID", "HANDOFF_CHANGED_AFTER_EXPORT")).toMatch(/não confere com o handoff/)
    expect(cvFileText("CV_OUTSIDE_PDF_DIR")).toMatch(/fora da pasta/)
  })
})
