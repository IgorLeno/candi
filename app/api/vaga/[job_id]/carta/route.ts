import { isLocalRequest } from "@/lib/auth/local-request"
import { readLetterPdf } from "@/lib/ops/cv-file"
import { isDispatchEnabled } from "@/lib/ops/dispatcher"

// The cover letter PDF of one job, inline, for the preview in the job page ("Carta de apresentação"). Read-only and
// guarded like `/curriculo`: job-search says which file (`dispatch.py letter-file`), the panel never takes a path from
// the request, and the request is checked to be local here too (route handlers are not covered by the layout guard).

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ job_id: string }> }): Promise<Response> {
  if (!(await isLocalRequest())) return new Response(null, { status: 403 })
  if (!isDispatchEnabled()) return new Response(null, { status: 404 })
  const { job_id: jobId } = await params
  const pdf = await readLetterPdf(jobId)
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
