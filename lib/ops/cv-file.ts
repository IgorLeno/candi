import "server-only"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { runDispatcher } from "@/lib/ops/dispatcher"
import { JOB_ID_RE, cvFileResultSchema, letterFileResultSchema, type CvFile } from "@/lib/ops/schema"

// The résumé (or cover letter) PDF of one job, read from the path job-search's dispatcher returns (`dispatch.py
// cv-file` / `letter-file`), never from a path the client sent. job-search already checked the record and the folder;
// the bytes are checked again here (PDF header and sha256), so a file swapped after the check is refused instead of
// shown. A refusal for a bad record keeps job-search's code (CV_NOT_VALID / LETTER_NOT_VALID).

export type CvPdf = { ok: true; file: CvFile; bytes: Buffer } | { ok: false; code: string; detail?: string }
type FileInfo = { ok: true; file: CvFile } | { ok: false; code: string; detail?: string }

export async function cvFileInfo(jobId: string): Promise<FileInfo> {
  if (!JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["cv-file", jobId], cvFileResultSchema)
  if (!result.ok) return { ok: false, code: result.code, detail: result.detail }
  return { ok: true, file: result.value.cv_file }
}

export async function letterFileInfo(jobId: string): Promise<FileInfo> {
  if (!JOB_ID_RE.test(jobId)) return { ok: false, code: "INPUT_INVALID" }
  const result = await runDispatcher(["letter-file", jobId], letterFileResultSchema)
  if (!result.ok) return { ok: false, code: result.code, detail: result.detail }
  return { ok: true, file: result.value.letter_file }
}

async function readChecked(info: FileInfo, notValid: string): Promise<CvPdf> {
  if (!info.ok) return info
  const { file } = info
  if (!path.isAbsolute(file.path) || path.basename(file.path) !== file.filename) {
    return { ok: false, code: "CV_PATH_INVALID" }
  }
  let bytes: Buffer
  try {
    bytes = await readFile(file.path)
  } catch {
    return { ok: false, code: notValid, detail: "PDF_MISSING" }
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, code: notValid, detail: "NOT_A_PDF" }
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    return { ok: false, code: notValid, detail: "PDF_HASH_MISMATCH" }
  }
  return { ok: true, file, bytes }
}

export async function readCvPdf(jobId: string): Promise<CvPdf> {
  return readChecked(await cvFileInfo(jobId), "CV_NOT_VALID")
}

export async function readLetterPdf(jobId: string): Promise<CvPdf> {
  return readChecked(await letterFileInfo(jobId), "LETTER_NOT_VALID")
}
