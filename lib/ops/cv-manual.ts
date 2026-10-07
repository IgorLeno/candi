import type { CvDoc } from "@/lib/ops/schema"

export type ManualEdit = { path: string; text: string }
type ManualResult = { ok: true; edits: ManualEdit[] } | { ok: false; code: string }

const APPROVAL = /\b(ok|n[aã]o)\s+[0-9a-f]{8}\b/i
const CONTRACT_MARKER =
  /\b(SUBMIT_UNCERTAIN|HUMAN_AUTH_REQUIRED|HUMAN_CHATGPT_LOGIN_REQUIRED|AWAITING_APPROVAL|READY_TO_SUBMIT|PATCH_READY|WRITESET_COMPLETE)\b/

/** UX guard over job-search's field list. The dispatcher validates the same edits again before writing. */
export function normalizeManualEdits(doc: CvDoc, input: unknown): ManualResult {
  if (!Array.isArray(input) || input.length === 0 || input.length > 80) return { ok: false, code: "MANUAL_INVALID" }
  const fields = new Map(doc.sections.flatMap((section) => section.fields.map((field) => [field.path, field] as const)))
  const seen = new Set<string>()
  const edits: ManualEdit[] = []
  for (const edit of input) {
    if (!edit || typeof edit !== "object" || Object.keys(edit).sort().join() !== "path,text")
      return { ok: false, code: "MANUAL_INVALID" }
    const { path, text } = edit as Record<string, unknown>
    if (typeof path !== "string" || typeof text !== "string" || seen.has(path))
      return { ok: false, code: "MANUAL_INVALID" }
    seen.add(path)
    const field = fields.get(path)
    if (!field) return { ok: false, code: `MANUAL_PATH_MISSING:${path}` }
    if (field.locked) return { ok: false, code: `MANUAL_PATH_LOCKED:${path}` }
    const normalized = text.normalize("NFKC").trim().replace(/\s+/gu, " ")
    if (!normalized) return { ok: false, code: `MANUAL_TEXT_EMPTY:${path}` }
    if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(normalized)) return { ok: false, code: `MANUAL_TEXT_CONTROL:${path}` }
    if (/[<>]/.test(normalized)) return { ok: false, code: `MANUAL_TEXT_MARKUP:${path}` }
    if ([...normalized].length > field.max) return { ok: false, code: `MANUAL_TEXT_TOO_LONG:${path}` }
    if (APPROVAL.test(normalized)) return { ok: false, code: `MANUAL_TEXT_LOOKS_LIKE_APPROVAL:${path}` }
    if (normalized.toLowerCase().includes("[painel:") || CONTRACT_MARKER.test(normalized))
      return { ok: false, code: `MANUAL_TEXT_CONTRACT_MARKER:${path}` }
    if (normalized !== field.text.trim().replace(/\s+/gu, " ")) edits.push({ path, text: normalized })
  }
  return edits.length ? { ok: true, edits } : { ok: false, code: "MANUAL_NO_CHANGES" }
}
