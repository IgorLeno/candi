// "Vaga indicada": the only free text the panel sends to job-search. The dispatcher is the authority (same
// guards in `dispatch.py normalize_intake`); this mirror only spares a refused round trip and shows the reason.
// The text never becomes a bot command: the dispatcher stores it as untrusted data and the command points to it.

export const INTAKE_MIN = 10
export const INTAKE_MAX = 1500

/** Same as job-search `dispatch.APPROVAL_RE` (an approval is `ok|não` + 8 hex typed in the bot chat). */
const APPROVAL_RE = /\b(ok|n[aã]o)\s+[0-9a-f]{8}\b/i

/** job-search `dispatch.MARKERS`: contract markers the bots report; a request must not carry them. */
export const CONTRACT_MARKERS = [
  "SUBMIT_UNCERTAIN",
  "HUMAN_AUTH_REQUIRED",
  "HUMAN_CHATGPT_LOGIN_REQUIRED",
  "HUMAN_CONTROL_PAUSED",
  "HUMAN_REQUIRED",
  "NEEDS_HUMAN",
  "BUDGET_EXCEEDED",
  "BROWSER_INFRA_BLOCKED",
  "BLOCKED_EDITORIAL",
  "BLOCKED",
  "NEEDS_CONTEXT",
  "AWAITING_APPROVAL",
  "READY_TO_SUBMIT",
  "PATCH_READY",
  "WRITESET_COMPLETE",
  "WAITING",
] as const
const MARKER_RE = new RegExp(`\\b(${CONTRACT_MARKERS.join("|")})\\b`)

export type IntakeCheck =
  | { ok: true; text: string }
  | { ok: false; code: "INTAKE_INVALID" | "INTAKE_LOOKS_LIKE_APPROVAL" }

/** Length in code points, as Python counts it (an emoji is one character, not two UTF-16 units). */
export function intakeLength(text: string): number {
  return [...text].length
}

/** NFKC, no control/format characters (keeps line breaks), 10–1500 characters, nothing that reads as a command. */
export function normalizeIntake(raw: string): IntakeCheck {
  const text = raw
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/(?!\n)[\p{Cc}\p{Cf}]/gu, "")
    .trim()
  const length = intakeLength(text)
  if (length < INTAKE_MIN || length > INTAKE_MAX) return { ok: false, code: "INTAKE_INVALID" }
  if (APPROVAL_RE.test(text)) return { ok: false, code: "INTAKE_LOOKS_LIKE_APPROVAL" }
  if (text.toLowerCase().includes("[painel:") || MARKER_RE.test(text)) return { ok: false, code: "INTAKE_INVALID" }
  return { ok: true, text }
}
