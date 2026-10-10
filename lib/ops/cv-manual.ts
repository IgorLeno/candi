import type { CvDoc, CvDocument, CvEntry, CvSection } from "@/lib/ops/schema"

/**
 * "Editar currículo" manual (cv-manual/2, docs/plans/2026-10-10-edicao-manual-flexivel.md): the panel edits a copy of
 * the job's `cv-doc/1` and sends the whole document. Everything here is UX: job-search normalizes, validates the
 * schema, the structure limits and the text guards again, and refuses with the same codes.
 */

export const MANUAL_SCHEMA = "cv-manual/2"
export type CvLimits = CvDoc["limits"]
type TextKind = keyof CvDoc["max_len"]
export type ManualPayload = { schema: typeof MANUAL_SCHEMA; doc_sha256: string; doc: CvDocument }
type ManualResult = { ok: true; doc: CvDocument } | { ok: false; code: string }

const APPROVAL = /\b(ok|n[aã]o)\s+[0-9a-f]{8}\b/i
const CONTRACT_MARKER =
  /\b(SUBMIT_UNCERTAIN|HUMAN_AUTH_REQUIRED|HUMAN_CHATGPT_LOGIN_REQUIRED|AWAITING_APPROVAL|READY_TO_SUBMIT|PATCH_READY|WRITESET_COMPLETE)\b/
// cv_doc.LINK_HOST_RE: any public domain over https, no IP, user or port.
const LINK_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** NFKC, trimmed, inner whitespace collapsed: what job-search stores. */
export function squash(text: string): string {
  return text.normalize("NFKC").trim().replace(/\s+/gu, " ")
}

/** cv_doc.link_from_text: the PDF shows the link without the scheme. */
export function linkFromText(text: string): { href: string; text: string } {
  const shown = text.startsWith("https://") ? text.slice("https://".length) : text
  return { href: `https://${shown}`, text: shown }
}

function linkAllowed(href: string): boolean {
  if (/\s/u.test(href)) return false
  try {
    const url = new URL(href)
    const authority = href.slice("https://".length).split(/[/?#]/u)[0]
    return url.protocol === "https:" && authority === url.hostname && LINK_HOST.test(url.hostname)
  } catch {
    return false
  }
}

function textCode(text: string, max: number, allowEmpty = false): string | null {
  if (!text) return allowEmpty ? null : "TEXT_EMPTY"
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(text)) return "TEXT_CONTROL"
  if (/[<>]/.test(text)) return "TEXT_MARKUP"
  if ([...text].length > max) return "TEXT_TOO_LONG"
  if (APPROVAL.test(text)) return "TEXT_LOOKS_LIKE_APPROVAL"
  if (text.toLowerCase().includes("[painel:") || CONTRACT_MARKER.test(text)) return "TEXT_CONTRACT_MARKER"
  return null
}

type Field = { path: string; text: string; kind: TextKind; allowEmpty?: boolean; link?: boolean }

/** Every text of the document with its job-search path (cv_doc.paths), org split in its two parts. */
export function fields(doc: CvDocument): Field[] {
  const out: Field[] = (["name", "headline", "location", "contact"] as const).map((key) => ({
    path: `header/${key}`,
    text: doc.header[key],
    kind: "field",
  }))
  for (const section of doc.sections) {
    out.push({ path: `${section.id}/title`, text: section.title, kind: "field" })
    if (section.kind === "paragraph") out.push({ path: `${section.id}/text`, text: section.text, kind: "paragraph" })
    else if (section.kind === "entries")
      for (const item of section.items) {
        const base = `${section.id}/${item.id}`
        out.push({ path: `${base}/title`, text: item.title, kind: "field" })
        if (item.date !== undefined) out.push({ path: `${base}/date`, text: item.date, kind: "field" })
        if (item.org) {
          out.push({ path: `${base}/org`, text: item.org.strong, kind: "field", allowEmpty: true })
          out.push({ path: `${base}/org`, text: item.org.rest, kind: "field" })
        }
        if (item.link) out.push({ path: `${base}/link`, text: item.link.text, kind: "field", link: true })
        for (const bullet of item.bullets)
          out.push({ path: `${base}/bullets/${bullet.id}`, text: bullet.text, kind: "bullet" })
      }
    else if (section.kind === "pairs")
      for (const row of section.rows) {
        out.push({ path: `${section.id}/${row.id}/label`, text: row.label, kind: "field" })
        out.push({ path: `${section.id}/${row.id}/text`, text: row.text, kind: "field" })
      }
    else
      for (const line of section.lines) out.push({ path: `${section.id}/${line.id}`, text: line.text, kind: "field" })
  }
  return out
}

function mapTexts<T>(value: T, key?: string): T {
  if (Array.isArray(value)) return value.map((item) => mapTexts(item)) as T
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapTexts(v, k)])) as T
  if (typeof value === "string" && !["id", "kind", "schema", "lang", "template", "href"].includes(key ?? ""))
    return squash(value) as T
  return value
}

/** The edited document as job-search will store it: texts squashed, links rebuilt from their text. */
export function normalizeDoc(doc: CvDocument): CvDocument {
  const out = mapTexts(doc)
  for (const section of out.sections)
    if (section.kind === "entries")
      for (const item of section.items) if (item.link) item.link = linkFromText(item.link.text)
  return out
}

function sectionItemCount(section: CvSection): number {
  if (section.kind === "entries") return section.items.length
  if (section.kind === "pairs") return section.rows.length
  if (section.kind === "lines") return section.lines.length
  return 1
}

/** Mirror of the dispatcher's checks over the whole edited document (UX only). */
export function checkManualDoc(original: CvDoc, edited: CvDocument): ManualResult {
  const doc = normalizeDoc(edited)
  for (const field of fields(doc)) {
    const code = textCode(field.text, original.max_len[field.kind], field.allowEmpty)
    if (code) return { ok: false, code: `MANUAL_${code}:${field.path}` }
    if (field.link && !linkAllowed(linkFromText(field.text).href))
      return { ok: false, code: `MANUAL_LINK_NOT_ALLOWED:${field.path}` }
  }
  for (const section of doc.sections) {
    if (sectionItemCount(section) === 0) return { ok: false, code: `MANUAL_SECTION_EMPTY:${section.id}` }
    const reason = section.kind === "entries" ? section.items.find((item) => item.bullets.length === 0) : undefined
    if (reason) return { ok: false, code: `MANUAL_BULLETS_EMPTY:${section.id}/${reason.id}` }
  }
  const limit = limitError(doc, original.limits)
  if (limit) return { ok: false, code: limit }
  if (JSON.stringify(doc) === JSON.stringify(normalizeDoc(original.doc)))
    return { ok: false, code: "MANUAL_NO_CHANGES" }
  return { ok: true, doc }
}

function limitError(doc: CvDocument, limits: CvLimits): string | null {
  for (const section of doc.sections) {
    if (section.kind === "pairs" && section.rows.length > limits.skills_rows) return `MANUAL_LIMIT_SKILLS:${section.id}`
    if (section.kind !== "entries") continue
    if (section.id === "projects" && section.items.length > limits.projects_items)
      return `MANUAL_LIMIT_PROJECTS:${section.id}`
    if (
      section.id === "education" &&
      section.items.reduce((n, item) => n + item.bullets.length, 0) > limits.education_bullets
    )
      return `MANUAL_LIMIT_EDUCATION:${section.id}`
    const crowded = section.items.find((item) => item.bullets.length > limits.item_bullets)
    if (crowded) return `MANUAL_LIMIT_BULLETS:${section.id}/${crowded.id}`
  }
  return null
}

// ------------------------------------------------------------------ structure edits (pure; ids are the panel's)

/** `<prefix><n>` with n = highest in use + 1 (job-search only checks ids are valid and unique). */
export function nextId(ids: string[], prefix: string): string {
  const numbers = ids.map((id) => new RegExp(`^${prefix}(\\d+)$`).exec(id)).map((m) => (m ? Number(m[1]) : 0))
  return `${prefix}${Math.max(0, ...numbers) + 1}`
}

function withSection(doc: CvDocument, sectionId: string, edit: (section: CvSection) => CvSection): CvDocument {
  return { ...doc, sections: doc.sections.map((section) => (section.id === sectionId ? edit(section) : section)) }
}

function withItem(doc: CvDocument, sectionId: string, index: number, edit: (item: CvEntry) => CvEntry): CvDocument {
  return withSection(doc, sectionId, (section) =>
    section.kind === "entries"
      ? { ...section, items: section.items.map((item, i) => (i === index ? edit(item) : item)) }
      : section
  )
}

function moved<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const out = [...list]
  ;[out[index], out[target]] = [out[target], out[index]]
  return out
}

export function setHeader(doc: CvDocument, key: keyof CvDocument["header"], text: string): CvDocument {
  return { ...doc, header: { ...doc.header, [key]: text } }
}

export function setSectionText(doc: CvDocument, sectionId: string, key: "title" | "text", text: string): CvDocument {
  return withSection(doc, sectionId, (section) => ({ ...section, [key]: text }) as CvSection)
}

export function setItemField(
  doc: CvDocument,
  sectionId: string,
  index: number,
  key: "title" | "date" | "strong" | "rest" | "link",
  text: string
): CvDocument {
  return withItem(doc, sectionId, index, (item) => {
    if (key === "strong" || key === "rest") return { ...item, org: { strong: "", rest: "", ...item.org, [key]: text } }
    if (key === "link") return { ...item, link: { href: item.link?.href ?? "", text } }
    return { ...item, [key]: text }
  })
}

export function setBullet(doc: CvDocument, sectionId: string, index: number, bullet: number, text: string): CvDocument {
  return withItem(doc, sectionId, index, (item) => ({
    ...item,
    bullets: item.bullets.map((b, i) => (i === bullet ? { ...b, text } : b)),
  }))
}

export function addBullet(doc: CvDocument, sectionId: string, index: number): CvDocument {
  return withItem(doc, sectionId, index, (item) => ({
    ...item,
    bullets: [
      ...item.bullets,
      {
        id: nextId(
          item.bullets.map((b) => b.id),
          "b"
        ),
        text: "",
      },
    ],
  }))
}

export function removeBullet(doc: CvDocument, sectionId: string, index: number, bullet: number): CvDocument {
  return withItem(doc, sectionId, index, (item) => ({ ...item, bullets: item.bullets.filter((_, i) => i !== bullet) }))
}

export function moveBullet(
  doc: CvDocument,
  sectionId: string,
  index: number,
  bullet: number,
  delta: number
): CvDocument {
  return withItem(doc, sectionId, index, (item) => ({ ...item, bullets: moved(item.bullets, bullet, delta) }))
}

export function addLink(doc: CvDocument, sectionId: string, index: number): CvDocument {
  return withItem(doc, sectionId, index, (item) => (item.link ? item : { ...item, link: { href: "", text: "" } }))
}

export function removeLink(doc: CvDocument, sectionId: string, index: number): CvDocument {
  return withItem(doc, sectionId, index, (item) => {
    const rest = { ...item }
    delete rest.link
    return rest
  })
}

/** Adds an empty entry, row or line at the end of the section; the user fills it before saving. */
export function addItem(doc: CvDocument, sectionId: string): CvDocument {
  return withSection(doc, sectionId, (section) => {
    if (section.kind === "entries") {
      const id = nextId(
        section.items.map((item) => item.id),
        "n"
      )
      const dated = section.id !== "projects"
      const item: CvEntry = dated
        ? { id, title: "", date: "", org: { strong: "", rest: "" }, bullets: [{ id: "b1", text: "" }] }
        : { id, title: "", bullets: [{ id: "b1", text: "" }] }
      return { ...section, items: [...section.items, item] }
    }
    if (section.kind === "pairs")
      return {
        ...section,
        rows: [
          ...section.rows,
          {
            id: nextId(
              section.rows.map((r) => r.id),
              "r"
            ),
            label: "",
            text: "",
          },
        ],
      }
    if (section.kind === "lines")
      return {
        ...section,
        lines: [
          ...section.lines,
          {
            id: nextId(
              section.lines.map((l) => l.id),
              "l"
            ),
            text: "",
          },
        ],
      }
    return section
  })
}

export function setRow(
  doc: CvDocument,
  sectionId: string,
  index: number,
  key: "label" | "text",
  text: string
): CvDocument {
  return withSection(doc, sectionId, (section) =>
    section.kind === "pairs"
      ? { ...section, rows: section.rows.map((row, i) => (i === index ? { ...row, [key]: text } : row)) }
      : section
  )
}

export function setLine(doc: CvDocument, sectionId: string, index: number, text: string): CvDocument {
  return withSection(doc, sectionId, (section) =>
    section.kind === "lines"
      ? { ...section, lines: section.lines.map((line, i) => (i === index ? { ...line, text } : line)) }
      : section
  )
}

export function removeItem(doc: CvDocument, sectionId: string, index: number): CvDocument {
  return withSection(doc, sectionId, (section) => {
    if (section.kind === "entries") return { ...section, items: section.items.filter((_, i) => i !== index) }
    if (section.kind === "pairs") return { ...section, rows: section.rows.filter((_, i) => i !== index) }
    if (section.kind === "lines") return { ...section, lines: section.lines.filter((_, i) => i !== index) }
    return section
  })
}

export function moveItem(doc: CvDocument, sectionId: string, index: number, delta: number): CvDocument {
  return withSection(doc, sectionId, (section) => {
    if (section.kind === "entries") return { ...section, items: moved(section.items, index, delta) }
    if (section.kind === "pairs") return { ...section, rows: moved(section.rows, index, delta) }
    if (section.kind === "lines") return { ...section, lines: moved(section.lines, index, delta) }
    return section
  })
}

// ------------------------------------------------------------------ why an option is off (M2: limits kept)

/** Reason to disable "Adicionar bullet" on an item, or null. */
export function addBulletBlocker(section: CvSection, index: number, limits: CvLimits): string | null {
  if (section.kind !== "entries") return "Sem bullets nesta seção."
  if (section.items[index].bullets.length >= limits.item_bullets) return `Máximo de ${limits.item_bullets} bullets.`
  if (
    section.id === "education" &&
    section.items.reduce((n, item) => n + item.bullets.length, 0) >= limits.education_bullets
  )
    return `Máximo de ${limits.education_bullets} bullets na formação.`
  return null
}

/** Reason to disable adding an item to the section, or null. */
export function addItemBlocker(section: CvSection, limits: CvLimits): string | null {
  if (section.kind === "paragraph") return "Seção de texto único."
  if (section.id === "projects" && sectionItemCount(section) >= limits.projects_items)
    return `Máximo de ${limits.projects_items} projetos.`
  if (section.kind === "pairs" && section.rows.length >= limits.skills_rows)
    return `Máximo de ${limits.skills_rows} categorias.`
  return null
}

/** The last item, row, line or bullet of a list cannot go: job-search refuses an empty list. */
export function removeItemBlocker(section: CvSection): string | null {
  return sectionItemCount(section) <= 1 ? "A seção precisa de ao menos um item." : null
}

export function payload(original: CvDoc, doc: CvDocument): ManualPayload {
  return { schema: MANUAL_SCHEMA, doc_sha256: original.doc_sha256, doc }
}
