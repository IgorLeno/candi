import "server-only"
import { unstable_cache } from "next/cache"
import { isLocalRequest } from "@/lib/auth/local-request"
import { buildJobSearchData } from "@/lib/job-search/build"
import {
  JobSearchSourceError,
  fetchSheetSnapshot,
  getAccessToken,
  loadServiceAccount,
} from "@/lib/job-search/sheets-api"
import type { JobSearchData, RawSnapshot } from "@/lib/job-search/types"
import fixture from "@/lib/job-search/fixtures/snapshot.json"

export const JOB_SEARCH_CACHE_TAG = "job-search"
const REVALIDATE_SECONDS = 300

/**
 * `sheets` only on explicit opt-in (`JOB_SEARCH_DATA_SOURCE=sheets`); anything else
 * reads the local fixture, so dev, tests and e2e never touch the real Sheet by default.
 */
export function dataSource(env: Record<string, string | undefined> = process.env): JobSearchData["source"] {
  return env.JOB_SEARCH_DATA_SOURCE === "sheets" ? "sheets" : "fixture"
}

const readSheets = unstable_cache(
  async (): Promise<JobSearchData> => {
    // Only reached through `getJobSearchData()`, after the local-request check.
    const spreadsheetId = process.env.JOB_SEARCH_SHEET_ID
    if (!spreadsheetId) throw new JobSearchSourceError("SHEET_ID_MISSING")
    const token = await getAccessToken(loadServiceAccount())
    const raw = await fetchSheetSnapshot({ spreadsheetId, token })
    return buildJobSearchData(raw, "sheets", new Date().toISOString())
  },
  ["job-search-snapshot"],
  { revalidate: REVALIDATE_SECONDS, tags: [JOB_SEARCH_CACHE_TAG] }
)

export async function getJobSearchData(): Promise<JobSearchData> {
  if (dataSource() === "sheets") {
    // Checked outside the cache on every call: a cached snapshot is never served to a
    // request not addressed to this machine, whatever route or action triggered it.
    if (!(await isLocalRequest())) throw new JobSearchSourceError("NOT_LOCAL")
    return readSheets()
  }
  return buildJobSearchData(fixture as RawSnapshot, "fixture", new Date().toISOString())
}
