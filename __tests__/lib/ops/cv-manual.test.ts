import { describe, expect, it } from "vitest"
import {
  addBullet,
  addBulletBlocker,
  addItem,
  addItemBlocker,
  addLink,
  checkManualDoc,
  moveItem,
  nextId,
  payload,
  removeBullet,
  removeItem,
  removeItemBlocker,
  removeLink,
  setBullet,
  setHeader,
  setItemField,
  setSectionText,
} from "@/lib/ops/cv-manual"
import { cvDocSchema, type CvDocument, type CvSection } from "@/lib/ops/schema"

const original = cvDocSchema.parse({
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
    header: { name: "IGOR", headline: "Engenharia Química", location: "São Paulo", contact: "igor@example.com" },
    sections: [
      { id: "summary", kind: "paragraph", title: "RESUMO", text: "Resumo atual." },
      {
        id: "experience",
        kind: "entries",
        title: "EXPERIÊNCIA",
        items: [
          {
            id: "cpqba",
            title: "Estágio",
            date: "2023",
            org: { strong: "CPQBA", rest: "Unicamp" },
            bullets: [{ id: "b1", text: "Fiz análises." }],
          },
        ],
      },
      {
        id: "projects",
        kind: "entries",
        title: "PROJETOS",
        items: [
          {
            id: "grimperium",
            title: "Candi — painel",
            link: { href: "https://github.com/IgorLeno/candi", text: "github.com/IgorLeno/candi" },
            bullets: [{ id: "b1", text: "Painel." }],
          },
          { id: "candi", title: "Grimperium — química", bullets: [{ id: "b1", text: "Química." }] },
        ],
      },
      { id: "languages", kind: "lines", title: "IDIOMAS", lines: [{ id: "l1", text: "Inglês" }] },
    ],
  },
})
const doc = original.doc

function section(d: CvDocument, id: string): CvSection {
  return d.sections.find((s) => s.id === id)!
}

function projects(d: CvDocument) {
  const s = section(d, "projects")
  if (s.kind !== "entries") throw new Error("projects")
  return s.items
}

describe("checkManualDoc", () => {
  it("refuses an unchanged document, also after whitespace-only edits", () => {
    expect(checkManualDoc(original, doc)).toEqual({ ok: false, code: "MANUAL_NO_CHANGES" })
    expect(checkManualDoc(original, setHeader(doc, "name", "  IGOR \n"))).toEqual({
      ok: false,
      code: "MANUAL_NO_CHANGES",
    })
  })

  it("accepts any field, the old locked ones included, and normalizes the text", () => {
    const result = checkManualDoc(original, setHeader(doc, "name", "  Ｉｇｏｒ   Leno "))
    expect(result.ok && result.doc.header.name).toBe("Igor Leno")
    const dated = checkManualDoc(original, setItemField(doc, "experience", 0, "date", "2023 – 2024"))
    expect(dated.ok).toBe(true)
  })

  it("mirrors the dispatcher's text guards with the field path", () => {
    const cases: [CvDocument, string][] = [
      [setSectionText(doc, "summary", "text", " "), "MANUAL_TEXT_EMPTY:summary/text"],
      [setSectionText(doc, "summary", "text", "Resumo <b>x</b>"), "MANUAL_TEXT_MARKUP:summary/text"],
      [setSectionText(doc, "summary", "text", "a​b"), "MANUAL_TEXT_CONTROL:summary/text"],
      [setSectionText(doc, "summary", "text", "x".repeat(901)), "MANUAL_TEXT_TOO_LONG:summary/text"],
      [setSectionText(doc, "summary", "text", "Resumo ok 1234abcd"), "MANUAL_TEXT_LOOKS_LIKE_APPROVAL:summary/text"],
      [setSectionText(doc, "summary", "text", "[painel: x]"), "MANUAL_TEXT_CONTRACT_MARKER:summary/text"],
      [setBullet(doc, "projects", 1, 0, "x".repeat(451)), "MANUAL_TEXT_TOO_LONG:projects/candi/bullets/b1"],
    ]
    for (const [edited, code] of cases) expect(checkManualDoc(original, edited)).toEqual({ ok: false, code })
  })

  it("allows an empty bold part of the institution but not an empty rest", () => {
    expect(checkManualDoc(original, setItemField(doc, "experience", 0, "strong", "")).ok).toBe(true)
    expect(checkManualDoc(original, setItemField(doc, "experience", 0, "rest", ""))).toEqual({
      ok: false,
      code: "MANUAL_TEXT_EMPTY:experience/cpqba/org",
    })
  })

  it("takes any public https link and rebuilds its href from the text", () => {
    const linked = setItemField(addLink(doc, "projects", 1), "projects", 1, "link", "https://igorleno.dev/lab")
    const result = checkManualDoc(original, linked)
    expect(result.ok && projects(result.doc)[1].link).toEqual({
      href: "https://igorleno.dev/lab",
      text: "igorleno.dev/lab",
    })
    for (const text of ["localhost/x", "127.0.0.1/x", "github.com:8443/x", "user@github.com/x", "a b.com"])
      expect(checkManualDoc(original, setItemField(linked, "projects", 1, "link", text))).toEqual({
        ok: false,
        code: "MANUAL_LINK_NOT_ALLOWED:projects/candi/link",
      })
    expect(checkManualDoc(original, addLink(doc, "projects", 1))).toEqual({
      ok: false,
      code: "MANUAL_TEXT_EMPTY:projects/candi/link",
    })
  })

  it("keeps job-search's structure limits", () => {
    let crowded = doc
    for (let i = 0; i < 3; i++) crowded = setBullet(addBullet(crowded, "projects", 0), "projects", 0, i + 1, `B${i}.`)
    expect(checkManualDoc(original, crowded)).toEqual({ ok: false, code: "MANUAL_LIMIT_BULLETS:projects/grimperium" })
    const third = addItem(doc, "projects")
    expect(checkManualDoc(original, third).ok).toBe(false)
    expect(checkManualDoc(original, removeItem(doc, "languages", 0))).toEqual({
      ok: false,
      code: "MANUAL_SECTION_EMPTY:languages",
    })
    expect(checkManualDoc(original, removeBullet(doc, "projects", 0, 0))).toEqual({
      ok: false,
      code: "MANUAL_BULLETS_EMPTY:projects/grimperium",
    })
  })
})

describe("structure edits", () => {
  it("reorders items keeping each item's own fields and link", () => {
    const swapped = moveItem(doc, "projects", 0, 1)
    expect(projects(swapped).map((p) => p.id)).toEqual(["candi", "grimperium"])
    expect(projects(swapped)[1].link?.text).toBe("github.com/IgorLeno/candi")
    expect(moveItem(doc, "projects", 1, 1)).toEqual(doc)
    expect(checkManualDoc(original, swapped).ok).toBe(true)
  })

  it("adds and removes bullets, links and items with fresh ids", () => {
    expect(projects(addBullet(doc, "projects", 0))[0].bullets.map((b) => b.id)).toEqual(["b1", "b2"])
    expect(projects(removeLink(doc, "projects", 0))[0]).not.toHaveProperty("link")
    expect(projects(addItem(doc, "projects"))[2]).toEqual({ id: "n1", title: "", bullets: [{ id: "b1", text: "" }] })
    const experience = section(addItem(doc, "experience"), "experience")
    expect(experience.kind === "entries" && experience.items[1]).toEqual({
      id: "n1",
      title: "",
      date: "",
      org: { strong: "", rest: "" },
      bullets: [{ id: "b1", text: "" }],
    })
    const languages = section(addItem(doc, "languages"), "languages")
    expect(languages.kind === "lines" && languages.lines.map((l) => l.id)).toEqual(["l1", "l2"])
    expect(nextId(["b1", "b7", "x3"], "b")).toBe("b8")
  })

  it("says why an option is off", () => {
    const limits = original.limits
    expect(addItemBlocker(section(doc, "projects"), limits)).toBe("Máximo de 2 projetos.")
    expect(addItemBlocker(section(doc, "experience"), limits)).toBeNull()
    expect(removeItemBlocker(section(doc, "languages"))).toBe("A seção precisa de ao menos um item.")
    let full = doc
    for (let i = 0; i < 2; i++) full = addBullet(full, "projects", 0)
    expect(addBulletBlocker(section(full, "projects"), 0, limits)).toBe("Máximo de 3 bullets.")
    expect(addBulletBlocker(section(doc, "projects"), 0, limits)).toBeNull()
  })

  it("wraps the document in the cv-manual/2 payload", () => {
    expect(payload(original, doc)).toEqual({ schema: "cv-manual/2", doc_sha256: "a".repeat(64), doc })
  })
})
