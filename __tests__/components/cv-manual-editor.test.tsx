import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CvDoc } from "@/lib/ops/schema"

const getCvDoc = vi.fn()
const saveCvManual = vi.fn()
vi.mock("@/app/actions/ops", () => ({
  getCvDoc: (...a: unknown[]) => getCvDoc(...a),
  saveCvManual: (...a: unknown[]) => saveCvManual(...a),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { CvManualEditor } from "@/components/job-search/cv-manual-editor"
import { rebaseManualDoc } from "@/lib/ops/cv-manual"

const original: CvDoc = {
  job_id: "fake-1001",
  lang: "pt",
  filename: "curriculo.pdf",
  doc_sha256: "a".repeat(64),
  limits: { skills_rows: 4, projects_items: 2, education_bullets: 2, item_bullets: 3 },
  max_len: { paragraph: 900, bullet: 450, field: 250 },
  doc: {
    schema: "cv-doc/1",
    lang: "pt",
    template: "classic-1",
    header: { name: "IGOR", headline: "Engenharia Química", location: "São Paulo", contact: "contato" },
    sections: [
      { id: "summary", kind: "paragraph", title: "RESUMO", text: "Resumo atual." },
      {
        id: "projects",
        kind: "entries",
        title: "PROJETOS",
        items: [
          {
            id: "grimperium",
            title: "Grimperium — projeto pessoal em Python",
            link: { href: "https://github.com/IgorLeno/grimperium", text: "github.com/IgorLeno/grimperium" },
            bullets: [{ id: "b1", text: "Química." }],
          },
          { id: "candi", title: "Candi — painel", bullets: [{ id: "b1", text: "Painel." }] },
        ],
      },
    ],
  },
}

beforeEach(() => {
  // Radix menus use pointer capture, absent in jsdom.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.scrollIntoView ??= () => {}
  getCvDoc.mockReset().mockResolvedValue({ ok: true, value: original })
  saveCvManual.mockReset().mockResolvedValue({ ok: true, value: {} })
  Object.values(toast).forEach((fn) => fn.mockReset())
})

describe("CvManualEditor", () => {
  it("shows generic labels, no locks, and every field editable", async () => {
    render(<CvManualEditor jobId="fake-1001" docVersion="" disabledReason={null} onStarted={() => {}} />)
    const block = await screen.findByTestId("cv-manual-projects-1")
    expect(block).toHaveTextContent("Projeto 1")
    expect(block).not.toHaveTextContent("Grimperium — projeto pessoal em Python ·")
    expect(screen.getByTestId("cv-manual-projects-1-title")).toHaveValue("Grimperium — projeto pessoal em Python")
    expect(screen.getByTestId("cv-manual-header-name")).toBeEnabled()
    expect(screen.queryByText("🔒")).toBeNull()
    expect(screen.getByTestId("cv-manual-submit")).toBeDisabled()
  })

  it("reorders projects, adds a link and a bullet, and sends the whole document", async () => {
    const user = userEvent.setup()
    const onStarted = vi.fn()
    render(<CvManualEditor jobId="fake-1001" docVersion="" disabledReason={null} onStarted={onStarted} />)
    await screen.findByTestId("cv-manual-projects-1")

    await user.click(screen.getByTestId("cv-manual-projects-1-menu"))
    await user.click(await screen.findByTestId("cv-manual-projects-1-down"))
    expect(screen.getByTestId("cv-manual-projects-1-title")).toHaveValue("Candi — painel")
    expect(screen.getByTestId("cv-manual-projects-2-link")).toHaveValue("github.com/IgorLeno/grimperium")

    await user.click(screen.getByTestId("cv-manual-projects-1-menu"))
    await user.click(await screen.findByTestId("cv-manual-projects-1-add-link"))
    expect(screen.getByTestId("cv-manual-error")).toHaveTextContent("Projeto 1 · Link")
    await user.type(screen.getByTestId("cv-manual-projects-1-link"), "github.com/IgorLeno/candi")

    await user.click(screen.getByTestId("cv-manual-projects-1-menu"))
    await user.click(await screen.findByTestId("cv-manual-projects-1-add-bullet"))
    await user.type(screen.getByTestId("cv-manual-projects-1-bullet-2"), "Dispara os bots.")

    await user.click(screen.getByTestId("cv-manual-projects-menu"))
    const add = await screen.findByTestId("cv-manual-projects-add")
    expect(add).toHaveAttribute("data-disabled")
    expect(within(add).getByText("(Máximo de 2 projetos.)")).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(screen.getByTestId("cv-manual-submit"))
    await waitFor(() => expect(onStarted).toHaveBeenCalled())
    const [jobId, input] = saveCvManual.mock.calls[0]
    expect(jobId).toBe("fake-1001")
    const projects = input.doc.sections[1].items
    expect(input.docSha256).toBe("a".repeat(64))
    expect(projects.map((p: { id: string }) => p.id)).toEqual(["candi", "grimperium"])
    expect(projects[0].link).toEqual({ href: "https://github.com/IgorLeno/candi", text: "github.com/IgorLeno/candi" })
    expect(projects[0].bullets).toEqual([
      { id: "b1", text: "Painel." },
      { id: "b2", text: "Dispara os bots." },
    ])
  })

  it("removes a bullet only while another one stays", async () => {
    const user = userEvent.setup()
    render(<CvManualEditor jobId="fake-1001" docVersion="" disabledReason={null} onStarted={() => {}} />)
    await screen.findByTestId("cv-manual-projects-1")
    expect(screen.getByTestId("cv-manual-projects-1-remove-bullet-1")).toBeDisabled()
    await user.click(screen.getByTestId("cv-manual-projects-1-remove-link"))
    expect(screen.queryByTestId("cv-manual-projects-1-link")).toBeNull()
    expect(screen.getByTestId("cv-manual-submit")).toBeEnabled()
  })

  it("after a finished edit, re-reads the document, keeps what was typed and sends the new hash", async () => {
    // 2026-10-10: the second save after v4 went with the hash from when the editor opened → CV_DOC_CHANGED.
    const user = userEvent.setup()
    const props = { jobId: "fake-1001", onStarted: () => {} }
    const { rerender } = render(<CvManualEditor {...props} docVersion="1" disabledReason={null} />)
    await user.type(await screen.findByTestId("cv-manual-summary-text"), " Novo.")
    await user.click(screen.getByTestId("cv-manual-submit"))
    expect(saveCvManual.mock.calls[0][1].docSha256).toBe("a".repeat(64))

    const saved = withSummary({ ...original, doc_sha256: "b".repeat(64) }, "Resumo atual. Novo.")
    getCvDoc.mockResolvedValue({ ok: true, value: saved })
    rerender(<CvManualEditor {...props} docVersion="1" disabledReason="Edição em andamento." />)
    rerender(<CvManualEditor {...props} docVersion="2" disabledReason={null} />)
    await waitFor(() => expect(getCvDoc).toHaveBeenCalledTimes(2))
    await user.type(screen.getByTestId("cv-manual-summary-text"), " Mais.")
    await waitFor(() => expect(screen.getByTestId("cv-manual-submit")).toBeEnabled())
    await user.click(screen.getByTestId("cv-manual-submit"))
    expect(saveCvManual.mock.calls[1][1].docSha256).toBe("b".repeat(64))
    expect(saveCvManual.mock.calls[1][1].doc.sections[0].text).toBe("Resumo atual. Novo. Mais.")
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it("on CV_DOC_CHANGED, reloads keeping the draft so the user can save again", async () => {
    const user = userEvent.setup()
    render(<CvManualEditor jobId="fake-1001" docVersion="" disabledReason={null} onStarted={() => {}} />)
    await user.type(await screen.findByTestId("cv-manual-summary-text"), " Meu.")
    const other = { ...original, doc_sha256: "c".repeat(64) }
    other.doc = { ...other.doc, header: { ...other.doc.header, headline: "Outra aba" } }
    getCvDoc.mockResolvedValue({ ok: true, value: other })
    saveCvManual.mockResolvedValueOnce({ ok: false, code: "CV_DOC_CHANGED" })
    await user.click(screen.getByTestId("cv-manual-submit"))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("recarregou mantendo")))
    expect(screen.getByTestId("cv-manual-summary-text")).toHaveValue("Resumo atual. Meu.")
    expect(screen.getByTestId("cv-manual-header-headline")).toHaveValue("Outra aba")
    await waitFor(() => expect(screen.getByTestId("cv-manual-submit")).toBeEnabled())
    await user.click(screen.getByTestId("cv-manual-submit"))
    await waitFor(() => expect(saveCvManual).toHaveBeenCalledTimes(2))
    expect(saveCvManual.mock.calls[1][1].docSha256).toBe("c".repeat(64))
  })
})

function withSummary(doc: CvDoc, text: string): CvDoc {
  const sections = doc.doc.sections.map((s) => (s.id === "summary" && s.kind === "paragraph" ? { ...s, text } : s))
  return { ...doc, doc: { ...doc.doc, sections } }
}

describe("rebaseManualDoc", () => {
  const base = original.doc
  const edit = (text: string) => withSummary(original, text).doc

  it("keeps the user's part when the new document left it alone, and takes the new parts", () => {
    const next = { ...base, header: { ...base.header, headline: "Nova" } }
    const out = rebaseManualDoc(base, edit("Meu resumo."), next)
    expect(out.conflicts).toEqual([])
    expect(out.doc.header.headline).toBe("Nova")
    expect(out.doc.sections[0]).toMatchObject({ text: "Meu resumo." })
  })

  it("takes the new document and names the part when both changed it differently", () => {
    const out = rebaseManualDoc(base, edit("Meu resumo."), edit("Resumo do ChatGPT."))
    expect(out.conflicts).toEqual(["RESUMO"])
    expect(out.doc.sections[0]).toMatchObject({ text: "Resumo do ChatGPT." })
  })

  it("treats the same change on both sides (the user's own save) as no conflict", () => {
    const out = rebaseManualDoc(base, edit("Igual  ."), edit("Igual ."))
    expect(out.conflicts).toEqual([])
  })
})
