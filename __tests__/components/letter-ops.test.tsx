import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Dispatch, LetterDoc } from "@/lib/ops/schema"

const getLetterDoc = vi.fn()
const saveLetterManual = vi.fn()
const applyLetter = vi.fn()
vi.mock("@/app/actions/ops", () => ({
  getLetterDoc: (...a: unknown[]) => getLetterDoc(...a),
  saveLetterManual: (...a: unknown[]) => saveLetterManual(...a),
  applyLetter: (...a: unknown[]) => applyLetter(...a),
}))
// The section's shared pieces live in ops.tsx (which pulls the auth stack); the editor only needs the refusal toast.
vi.mock("@/components/job-search/ops", () => ({
  DispatchCard: () => null,
  OpsBar: () => null,
  PdfPreview: () => null,
  useJobOps: () => ({}),
  toastRefusal: (code: string) => toast.error(code),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { LetterManualEditor } from "@/components/job-search/letter-ops"
import { LetterProposalApproval } from "@/components/job-search/letter-proposal"

function letter(sha: string, subject = "CANDIDATURA — TRAINEE"): LetterDoc {
  return {
    job_id: "fake-1001",
    sha256: sha,
    doc: {
      schema: "letter-doc/1",
      template: "classic-1",
      lang: "pt",
      header: { name: "IGOR", subtitle: "Concluinte", contacts: ["email"] },
      subject,
      date: "15 de outubro de 2026",
      greeting: "Prezada equipe,",
      paragraphs: ["Primeiro.", "Segundo.", "Terceiro."],
      closing: "Atenciosamente,",
      signature: "Igor",
    },
  }
}

describe("LetterManualEditor", () => {
  beforeEach(() => {
    getLetterDoc.mockReset()
    saveLetterManual.mockReset()
    toast.success.mockReset()
  })

  it("sends the edited text with the sha of the letter it opened", async () => {
    getLetterDoc.mockResolvedValue({ ok: true, value: letter("a".repeat(64)) })
    saveLetterManual.mockResolvedValue({ ok: true, value: { id: "d" } })
    const onStarted = vi.fn()
    render(<LetterManualEditor jobId="fake-1001" docVersion="v1" disabledReason={null} onStarted={onStarted} />)
    const second = await screen.findByLabelText("Parágrafo 2")
    await userEvent.clear(second)
    await userEvent.type(second, "Segundo, reescrito.")
    await userEvent.click(screen.getByTestId("letter-add-paragraph"))
    await userEvent.type(screen.getByLabelText("Parágrafo 4"), "Quarto.")
    await userEvent.click(screen.getByTestId("letter-manual-save"))
    await waitFor(() => expect(saveLetterManual).toHaveBeenCalledTimes(1))
    expect(saveLetterManual).toHaveBeenCalledWith("fake-1001", {
      docSha256: "a".repeat(64),
      text: {
        subject: "CANDIDATURA — TRAINEE",
        greeting: "Prezada equipe,",
        paragraphs: ["Primeiro.", "Segundo, reescrito.", "Terceiro.", "Quarto."],
        closing: "Atenciosamente,",
      },
    })
    expect(onStarted).toHaveBeenCalled()
  })

  it("keeps at least three paragraphs and reloads when the letter changes", async () => {
    getLetterDoc.mockResolvedValueOnce({ ok: true, value: letter("a".repeat(64)) })
    const { rerender } = render(
      <LetterManualEditor jobId="fake-1001" docVersion="v1" disabledReason={null} onStarted={() => {}} />
    )
    expect(await screen.findByLabelText("Remover o parágrafo 1")).toBeDisabled()
    getLetterDoc.mockResolvedValueOnce({ ok: true, value: letter("b".repeat(64), "ASSUNTO NOVO") })
    rerender(<LetterManualEditor jobId="fake-1001" docVersion="v2" disabledReason={null} onStarted={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText("Assunto")).toHaveValue("ASSUNTO NOVO"))
    expect(getLetterDoc).toHaveBeenCalledTimes(2)
  })

  it("without a letter it says to generate one first", async () => {
    getLetterDoc.mockResolvedValue({ ok: false, code: "LETTER_NOT_VALID" })
    render(<LetterManualEditor jobId="fake-1001" docVersion="" disabledReason={null} onStarted={() => {}} />)
    expect(await screen.findByTestId("letter-manual-empty")).toHaveTextContent("Gere a carta")
  })
})

describe("LetterProposalApproval", () => {
  it("shows before and after and sends only the decision", async () => {
    applyLetter.mockResolvedValue({ ok: true, value: { id: "d" } })
    const text = (p: string) => ({ subject: "S", greeting: "G", paragraphs: [p, "b", "c"], closing: "C" })
    const dispatch = {
      id: "d-20261015T120000Z-abcdef",
      action: "EDITAR_CARTA",
      status: "PRECISA_HUMANO",
      code: "LETTER_PENDING",
      progress: { percent: 40, stages: [], letter_proposal: { before: text("antes"), after: text("depois") } },
    } as unknown as Dispatch
    const onChanged = vi.fn()
    render(<LetterProposalApproval dispatch={dispatch} onChanged={onChanged} />)
    expect(screen.getByTestId("letter-proposal-before")).toHaveTextContent("antes")
    expect(screen.getByTestId("letter-proposal-after")).toHaveTextContent("depois")
    await userEvent.click(screen.getByTestId("letter-approve"))
    await waitFor(() => expect(applyLetter).toHaveBeenCalledWith("d-20261015T120000Z-abcdef", "approve"))
    expect(onChanged).toHaveBeenCalled()
  })
})
