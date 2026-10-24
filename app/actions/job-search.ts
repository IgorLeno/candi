"use server"

import { updateTag } from "next/cache"
import { isLocalRequest } from "@/lib/auth/local-request"
import { JOB_SEARCH_CACHE_TAG } from "@/lib/job-search/source"

/**
 * "Sincronizar": drops the cached Sheet snapshot so the next render reads it again.
 * Server Functions are not covered by `proxy.ts`, so the request is checked here (local only, no login).
 */
export async function syncJobSearch(): Promise<void> {
  if (!(await isLocalRequest())) throw new Error("NOT_LOCAL")
  updateTag(JOB_SEARCH_CACHE_TAG)
}
