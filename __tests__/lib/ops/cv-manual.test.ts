import { describe, expect, it } from "vitest"
import { normalizeManualEdits } from "@/lib/ops/cv-manual"
import { cvDocSchema } from "@/lib/ops/schema"

const doc = cvDocSchema.parse({
  job_id: "fake-1001",
  lang: "pt",
  filename: "curriculo.pdf",
  doc_sha256: "a".repeat(64),
  sections: [
    {
      id: "summary",
      title: "Resumo",
      fields: [
        {
          path: "summary/text",
          item: null,
          label: "Resumo",
          text: "Texto atual.",
          kind: "paragraph",
          max: 80,
          locked: false,
        },
        {
          path: "contact/email",
          item: null,
          label: "E-mail",
          text: "contato protegido",
          kind: "field",
          max: 80,
          locked: true,
        },
      ],
    },
  ],
})

describe("normalizeManualEdits", () => {
  it("sends only changed, unlocked fields with normalized text", () => {
    expect(normalizeManualEdits(doc, [{ path: "summary/text", text: "  Ｎｏｖｏ   resumo.  " }])).toEqual({
      ok: true,
      edits: [{ path: "summary/text", text: "Novo resumo." }],
    })
    expect(normalizeManualEdits(doc, [{ path: "summary/text", text: "Texto atual." }])).toEqual({
      ok: false,
      code: "MANUAL_NO_CHANGES",
    })
  })

  it("rejects unknown or locked paths and repeated paths", () => {
    expect(normalizeManualEdits(doc, [{ path: "contact/email", text: "outro" }])).toEqual({
      ok: false,
      code: "MANUAL_PATH_LOCKED:contact/email",
    })
    expect(normalizeManualEdits(doc, [{ path: "unknown", text: "outro" }])).toEqual({
      ok: false,
      code: "MANUAL_PATH_MISSING:unknown",
    })
    expect(
      normalizeManualEdits(doc, [
        { path: "summary/text", text: "primeiro" },
        { path: "summary/text", text: "segundo" },
      ])
    ).toEqual({ ok: false, code: "MANUAL_INVALID" })
  })

  it("refuses approval text, markup and field overflow", () => {
    for (const [text, code] of [
      ["ok 1a2b3c4d", "MANUAL_TEXT_LOOKS_LIKE_APPROVAL:summary/text"],
      ["<b>Resumo</b>", "MANUAL_TEXT_MARKUP:summary/text"],
      ["x".repeat(81), "MANUAL_TEXT_TOO_LONG:summary/text"],
    ]) {
      expect(normalizeManualEdits(doc, [{ path: "summary/text", text }])).toEqual({ ok: false, code })
    }
  })
})
