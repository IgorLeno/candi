import { getAllowedSession } from "@/lib/auth/session"
import { readCvPdf } from "@/lib/ops/cv-file"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"

// The résumé PDF of one job, inline, for the preview in the job page ("Currículo"). Read-only: job-search says which
// file (`dispatch.py cv-file`), the panel never takes a path from the request. The proxy already answers 401 without
// a session; this handler checks the session again (route handlers are not covered by the layout guard).

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ job_id: string }> }): Promise<Response> {
  if (!(await getAllowedSession())) return new Response(null, { status: 401 })
  if (!isDispatchEnabled()) return new Response(null, { status: 404 })
  const { job_id: jobId } = await params
  const pdf = await readCvPdf(jobId)
  if (!pdf.ok) {
    const status = pdf.code === "INPUT_INVALID" || pdf.code === "JOB_ID_INVALID" ? 400 : 404
    return new Response(JSON.stringify({ ok: false, code: pdf.code }), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  }
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.bytes.length),
      "Content-Disposition": `inline; filename="${pdf.file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
