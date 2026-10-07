import { rmSync } from "fs"
import path from "path"

/**
 * Bot dispatch in E2E points at a fake job-search (`e2e/fixtures/job-search-fake`): same CLI and JSON as
 * the real `hermes/browsers/dispatch.py`, no bots, no gateway. A reused server must be started with these
 * values too (see `playwright.config.ts`).
 */
export const E2E_FAKE_DISPATCH_STATE = path.resolve(__dirname, ".fake-dispatch-state")

export const E2E_OPS_ENV = {
  JOB_SEARCH_DISPATCH_ENABLED: "true",
  JOB_SEARCH_REPO: path.resolve(__dirname, "fixtures", "job-search-fake"),
  JOB_SEARCH_BROWSERS_STATE: E2E_FAKE_DISPATCH_STATE,
} as const

export function resetFakeDispatches() {
  rmSync(path.join(E2E_FAKE_DISPATCH_STATE, "fake-dispatch.json"), { force: true })
  rmSync(path.join(E2E_FAKE_DISPATCH_STATE, "cv-renderer"), { force: true })
}
