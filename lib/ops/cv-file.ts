import "server-only"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { runDispatcher } from "@/lib/ops/dispatcher"
import { JOB_ID_RE, cvFileResultSchema, type CvFile } from "@/lib/ops/schema"

// The résumé PDF of one job, read from the path job-search's dispatcher returns (`dispatch.py cv-file`), never from
// a path the client sent. job-search already checked `cv.json` and the folder; the bytes are checked again here
// (PDF header and sha256), so a file swapped after the check is refused instead of shown.

export type CvPdf = { ok: true; file: CvFile; bytes: Buffer } | { ok: false; code: string; detail?: string }

export async function cvFileInfo(
  jobId: string
): Promise<{ ok: true; file: CvFile } | { ok: false; code: string; detail?: string }> {
  if (!JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["cv-file", jobId], cvFileResultSchema)
  if (!result.ok) return { ok: false, code: result.code, detail: result.detail }
  return { ok: true, file: result.value.cv_file }
}

export async function readCvPdf(jobId: string): Promise<CvPdf> {
  const info = await cvFileInfo(jobId)
  if (!info.ok) return info
  const { file } = info
  if (!path.isAbsolute(file.path) || path.basename(file.path) !== file.filename) {
    return { ok: false, code: "CV_PATH_INVALID" }
  }
  let bytes: Buffer
  try {
    bytes = await readFile(file.path)
  } catch {
    return { ok: false, code: "CV_NOT_VALID", detail: "PDF_MISSING" }
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-")
    return { ok: false, code: "CV_NOT_VALID", detail: "NOT_A_PDF" }
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    return { ok: false, code: "CV_NOT_VALID", detail: "PDF_HASH_MISMATCH" }
  }
  return { ok: true, file, bytes }
}
