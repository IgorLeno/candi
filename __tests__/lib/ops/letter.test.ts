import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildJobSearchData } from "@/lib/job-search/build"
import { fixtureSnapshot } from "@/__tests__/lib/job-search/helpers"

const session = vi.hoisted(() => ({ current: null as null | { user: { email: string } } }))
const runDispatcher = vi.hoisted(() => vi.fn())
const views = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock("@/lib/auth/session", () => ({ getAllowedSession: vi.fn(async () => session.current) }))
vi.mock("@/lib/ops/dispatcher", () => ({ runDispatcher, isDispatchEnabled: () => true }))
vi.mock("@/lib/job-search/source", () => ({
  JOB_SEARCH_CACHE_TAG: "job-search",
  getJobSearchData: vi.fn(async () => ({ views: views.current })),
}))
vi.mock("next/cache", () => ({ updateTag: vi.fn() }))

import {
  applyLetter,
  getLetterDoc,
  getLetterFile,
  requestLetterEdit,
  saveLetterManual,
  startLetter,
} from "@/app/actions/ops"
import { GET } from "@/app/api/vaga/[job_id]/carta/route"
import { readLetterPdf } from "@/lib/ops/cv-file"
import { canDecideLetter, canResumeCv, letterEditStopText, letterFileText } from "@/lib/ops/present"
import { listResultSchema, type Dispatch } from "@/lib/ops/schema"

const JOB = "fake-1001"
const SHA = "a".repeat(64)
const TEXT = {
  subject: "CANDIDATURA — TRAINEE",
  greeting: "Prezada equipe,",
  paragraphs: ["Um.", "Dois.", "Três.", "  "],
  closing: "Atenciosamente,",
}

function dispatch(over: Partial<Dispatch> = {}): Dispatch {
  return {
    id: "d-20261015T120000Z-abcdef",
    action: "GERAR_CARTA",
    platform: "hermes",
    job_id: JOB,
    status: "PRECISA_HUMANO",
    code: "HUMAN_REVIEW_DOUBTS",
    marker: null,
    bot: "ChatGPT + template local (host)",
    mode: "host",
    active: false,
    acknowledged: false,
    created_at: "2026-10-15T12:00:00Z",
    finished_at: null,
    progress: {
      percent: 30,
      stages: [],
      recovery: {
        reason: "dúvida",
        claude_reason: null,
        claude_reply: null,
        doubts: [],
        options: [],
        note_allowed: true,
      },
    },
    ...over,
  } as Dispatch
}

describe("cover letter server actions", () => {
  beforeEach(() => {
    session.current = { user: { email: "owner@e2e.test" } }
    runDispatcher.mockReset()
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, dispatch: { id: "d" } } })
    views.current = buildJobSearchData(fixtureSnapshot(), "fixture", "2026-09-29T12:00:00Z").views
  })

  it("require a session", async () => {
    session.current = null
    await expect(startLetter(JOB)).rejects.toThrow("UNAUTHENTICATED")
    await expect(saveLetterManual(JOB, {})).rejects.toThrow("UNAUTHENTICATED")
    await expect(requestLetterEdit(JOB, "x")).rejects.toThrow("UNAUTHENTICATED")
    await expect(applyLetter("d-20261015T120000Z-abcdef", "approve")).rejects.toThrow("UNAUTHENTICATED")
    expect(runDispatcher).not.toHaveBeenCalled()
  })

  it("start: only the job_id, Hermes, for a job in the Sheet", async () => {
    expect(await startLetter(JOB)).toEqual({ ok: true, value: { id: "d" } })
    expect(runDispatcher).toHaveBeenCalledWith(
      ["start", "GERAR_CARTA", "--platform", "hermes", "--job-id", JOB],
      expect.anything()
    )
    expect(await startLetter("../x")).toEqual({ ok: false, code: "INPUT_INVALID" })
    expect(await startLetter("nao-existe")).toEqual({ ok: false, code: "JOB_NOT_FOUND" })
    expect(runDispatcher).toHaveBeenCalledTimes(1)
  })

  it("manual: the letter text over stdin with the opened sha; empty paragraphs dropped", async () => {
    expect(await saveLetterManual(JOB, { docSha256: SHA, text: TEXT })).toEqual({ ok: true, value: { id: "d" } })
    const [args, , , options] = runDispatcher.mock.calls[0]
    expect(args).toEqual(["start", "EDITAR_CARTA", "--platform", "hermes", "--job-id", JOB, "--manual-stdin"])
    expect(JSON.parse(options.stdin)).toEqual({
      schema: "letter-manual/1",
      base_sha256: SHA,
      subject: TEXT.subject,
      greeting: TEXT.greeting,
      paragraphs: ["Um.", "Dois.", "Três."],
      closing: TEXT.closing,
    })
    for (const bad of [
      { docSha256: "x", text: TEXT },
      { docSha256: SHA, text: { ...TEXT, paragraphs: ["Um.", "Dois."] } },
      { docSha256: SHA, text: { ...TEXT, header: "x" } },
    ]) {
      expect(await saveLetterManual(JOB, bad)).toEqual({ ok: false, code: "MANUAL_INVALID" })
    }
    expect(runDispatcher).toHaveBeenCalledTimes(1)
  })

  it("request: guarded text over stdin, never argv", async () => {
    const text = "Tire o parágrafo sobre o programa rotacional, por favor."
    await requestLetterEdit(JOB, text)
    const [args, , , options] = runDispatcher.mock.calls[0]
    expect(args).toEqual(["start", "EDITAR_CARTA", "--platform", "hermes", "--job-id", JOB, "--request-stdin"])
    expect(options.stdin).toBe(text)
    expect(args.join(" ")).not.toContain("parágrafo")
    expect((await requestLetterEdit(JOB, "curto")).ok).toBe(false)
  })

  it("decision: a fixed word for a valid dispatch id", async () => {
    await applyLetter("d-20261015T120000Z-abcdef", "reject")
    expect(runDispatcher).toHaveBeenCalledWith(
      ["apply-letter", "d-20261015T120000Z-abcdef", "--decision", "reject"],
      expect.anything()
    )
    expect(await applyLetter("d-20261015T120000Z-abcdef", "talvez")).toEqual({ ok: false, code: "INPUT_INVALID" })
    expect(await applyLetter("../x", "approve")).toEqual({ ok: false, code: "INPUT_INVALID" })
  })

  it("letter-doc and letter-file only with a valid job_id", async () => {
    expect(await getLetterDoc("../x")).toEqual({ ok: false, code: "INPUT_INVALID" })
    runDispatcher.mockResolvedValue({ ok: false, code: "LETTER_NOT_VALID", detail: "LETTER_JSON_MISSING" })
    expect(await getLetterFile(JOB)).toEqual({ ok: false, code: "LETTER_NOT_VALID", detail: "LETTER_JSON_MISSING" })
    expect(runDispatcher).toHaveBeenCalledWith(["letter-file", JOB], expect.anything())
  })
})

describe("cover letter PDF", () => {
  const BYTES = Buffer.from("%PDF-1.4 carta de teste")
  const params = (jobId: string) => ({ params: Promise.resolve({ job_id: jobId }) })

  function pdfOnDisk(bytes = BYTES) {
    const dir = mkdtempSync(path.join(tmpdir(), "letter-file-"))
    const file = path.join(dir, "carta_igor-fernandes_pt_acme.pdf")
    writeFileSync(file, bytes)
    return {
      job_id: JOB,
      path: file,
      filename: "carta_igor-fernandes_pt_acme.pdf",
      size: bytes.length,
      sha256: createHash("sha256").update(BYTES).digest("hex"),
      exported_at: "2026-10-15T12:00:00Z",
    }
  }

  beforeEach(() => {
    session.current = { user: { email: "owner@e2e.test" } }
    runDispatcher.mockReset()
  })

  it("reads the registered file and refuses a swapped one", async () => {
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, letter_file: pdfOnDisk() } })
    const pdf = await readLetterPdf(JOB)
    expect(pdf.ok && pdf.bytes.equals(BYTES)).toBe(true)
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, letter_file: pdfOnDisk(Buffer.from("%PDF-x")) } })
    expect(await readLetterPdf(JOB)).toEqual({ ok: false, code: "LETTER_NOT_VALID", detail: "PDF_HASH_MISMATCH" })
  })

  it("route: 401 without session, inline PDF with session, 404 refusal otherwise", async () => {
    session.current = null
    expect((await GET(new Request("http://x"), params(JOB))).status).toBe(401)
    session.current = { user: { email: "owner@e2e.test" } }
    runDispatcher.mockResolvedValue({ ok: true, value: { ok: true, letter_file: pdfOnDisk() } })
    const ok = await GET(new Request("http://x"), params(JOB))
    expect(ok.headers.get("Content-Type")).toBe("application/pdf")
    expect(ok.headers.get("Content-Disposition")).toContain("carta_igor-fernandes_pt_acme.pdf")
    runDispatcher.mockResolvedValue({ ok: false, code: "LETTER_NOT_VALID" })
    expect((await GET(new Request("http://x"), params(JOB))).status).toBe(404)
  })

  it("explains why there is no letter", () => {
    expect(letterFileText("LETTER_NOT_VALID", "LETTER_JSON_MISSING")).toContain("Ainda não há carta")
    expect(letterFileText("LETTER_NOT_VALID", "PDF_HASH_MISMATCH")).toContain("Gere de novo")
  })
})

describe("cover letter in the dispatcher contract", () => {
  it("a stuck letter resumes like a stuck résumé", () => {
    expect(canResumeCv(dispatch())).toBe(true)
    expect(canResumeCv(dispatch({ retried_by: "d-20261015T130000Z-abcdef" }))).toBe(false)
  })

  it("a letter proposal waits for a whole-letter decision", () => {
    const text = { subject: "S", greeting: "G", paragraphs: ["a", "b", "c"], closing: "C" }
    const pending = dispatch({
      action: "EDITAR_CARTA",
      code: "LETTER_PENDING",
      progress: { percent: 40, stages: [], letter_proposal: { before: text, after: text } },
    })
    expect(canDecideLetter(pending)).toBe(true)
    expect(canDecideLetter({ ...pending, superseded_by: "d-20261015T130000Z-abcdef" })).toBe(false)
    expect(canDecideLetter({ ...pending, code: "REJECTED" })).toBe(false)
    expect(letterEditStopText("PAGE_OVERFLOW:2")).toContain("2 linha")
  })

  it("list parses letter records and the job's letter fields", () => {
    const text = { subject: "S", greeting: "G", paragraphs: ["a", "b", "c"], closing: "C" }
    const parsed = listResultSchema.safeParse({
      ok: true,
      gateway: "running",
      dispatches: [
        dispatch(),
        dispatch({
          action: "EDITAR_CARTA",
          code: "LETTER_PENDING",
          progress: { percent: 40, stages: [], letter_proposal: { before: text, after: text } },
        }),
      ],
      job: {
        job_id: JOB,
        dossier: "VALID",
        actionable: true,
        cv_allowed: true,
        cv: "VALID",
        application_state: null,
        letter: "VALID",
        letter_hint: true,
      },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.job?.letter_hint).toBe(true)
  })
})
