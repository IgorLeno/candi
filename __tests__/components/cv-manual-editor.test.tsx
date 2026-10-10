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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CvManualEditor } from "@/components/job-search/cv-manual-editor"

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
})

describe("CvManualEditor", () => {
  it("shows generic labels, no locks, and every field editable", async () => {
    render(<CvManualEditor jobId="fake-1001" disabledReason={null} onStarted={() => {}} />)
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
    render(<CvManualEditor jobId="fake-1001" disabledReason={null} onStarted={onStarted} />)
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
    render(<CvManualEditor jobId="fake-1001" disabledReason={null} onStarted={() => {}} />)
    await screen.findByTestId("cv-manual-projects-1")
    expect(screen.getByTestId("cv-manual-projects-1-remove-bullet-1")).toBeDisabled()
    await user.click(screen.getByTestId("cv-manual-projects-1-remove-link"))
    expect(screen.queryByTestId("cv-manual-projects-1-link")).toBeNull()
    expect(screen.getByTestId("cv-manual-submit")).toBeEnabled()
  })
})
