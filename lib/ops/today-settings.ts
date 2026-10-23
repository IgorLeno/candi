// Focus of the Hoje "Atualizar lista" (plan 2026-10-22): the fifth free text the panel sends to job-search. The
// dispatcher is the authority (`dispatch.py normalize_focus`); this mirror only explains a refusal before the round
// trip. The terms never become a bot command: job-search only filters text and builds searches with them.
import { APPROVAL_RE, MARKER_RE, intakeLength } from "@/lib/ops/intake"
import type { TodayFocus } from "@/lib/ops/schema"

export { TODAY_REPLACE } from "@/lib/ops/schema"

export const FOCUS_MAX = 80
export const FOCUS_FIELDS = ["cargo", "lugar"] as const

export type FocusCheck =
  | { ok: true; focus: TodayFocus }
  | { ok: false; code: "FOCUS_INVALID"; field: (typeof FOCUS_FIELDS)[number] }

/** One field as job-search keeps it: NFKC, line breaks and tabs as spaces, no control/format characters, spaces collapsed. */
export function cleanFocusTerm(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
}

/** Empty terms are allowed (no focus); up to 80 code points, nothing that reads as a marker or an approval. */
export function normalizeFocus(raw: TodayFocus): FocusCheck {
  const focus = { cargo: "", lugar: "" }
  for (const field of FOCUS_FIELDS) {
    const text = cleanFocusTerm(raw[field])
    if (
      intakeLength(text) > FOCUS_MAX ||
      APPROVAL_RE.test(text) ||
      text.toLowerCase().includes("[painel:") ||
      MARKER_RE.test(text)
    )
      return { ok: false, code: "FOCUS_INVALID", field }
    focus[field] = text
  }
  return { ok: true, focus }
}
