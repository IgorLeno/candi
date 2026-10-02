# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 16 dashboard (Portuguese UI) that is becoming the **read-only visual/analytical layer** of the `job-search` repo. Built with React 19, TypeScript and Tailwind CSS 4. **Local-first**: it runs on the owner's machine (`pnpm build && pnpm start`); there is no production deploy and no hosting provider (Vercel was dropped). Migration plan and status: `docs/plans/2026-09-25-job-search-visual-layer.md` — read it before changing architecture.

No AI, no PDF generation, no database (Supabase was removed in WP2 and is not used): the job-search bots do that work, the `job-search` Git repo stays the authority for rules, and the Google Sheet is the read-only operational source. The dashboard never writes to the Sheet. Since 2026-09-29 it is also the **bot trigger panel** ("central de operações", `docs/plans/2026-09-29-ops-center-bot-triggers.md`): it can ask the job-search bots to start work through job-search's `hermes/browsers/dispatch.py`, and ask job-search to persist a validated search writeset ("Registrar na planilha": `dispatch.py persist` → `writeset.py persist` after `check` VALID, with job-search's own write credential). Since 2026-09-30 it also takes a "vaga indicada" (`docs/plans/2026-09-30-vaga-indicada.md`): free text the panel sends, narrowly excepted: guarded in the panel and again by the dispatcher, sent over stdin (never argv), stored by job-search as untrusted data in a private file the fixed command only points to. Since 2026-10-02 a stuck "Gerar currículo" (host run in `PRECISA_HUMANO`, `docs/plans/2026-10-02-curriculo-travado.md`) shows job-search's reason and options and can be resumed (`dispatch.py resume-cv <id> --option claude|chatgpt`); its "Outro" text is the second narrow free-text exception, with the same guards and transport (stdin, never argv), stored by job-search as untrusted data in a private file and quoted to ChatGPT as the user's guidance, below the job data and above the rules. Since 2026-09-30 it can also ask job-search to discard a job the user will not apply for ("Descartar vaga", `docs/plans/2026-09-30-descartar-vaga.md`): `dispatch.py decline <job_id>` → `application.py decline` writes `status_candidatura = RETIRADA` with a `CLOSED`/`USER_DECLINED` event using job-search's credential; the job stays listed with the red "descartada" stamp, no undo. Since 2026-10-01 it can also ask job-search to delete a job from the Sheet ("Excluir vaga"): `dispatch.py delete-job <job_id>` → `application.py delete` backs the rows up locally, then deletes the main-tab row and the job's "Eventos de Candidatura" and "Dossiers" rows using job-search's credential; the job leaves the panel and the dedup (a later search may bring it back), no undo. Since 2026-09-30 it can also ask job-search to analyse one job already in the Sheet ("Analisar"/"Refazer análise", `docs/plans/2026-09-30-analisar-vaga.md`): `dispatch.py start ANALISAR_VAGA --platform hermes --job-id <id>` sends only the job_id; job-search reads the row and the posting itself, runs the ChatGPT analysis on the host and leaves a writeset that the user registers with the existing "Registrar na planilha" (UPSERT of the same row, candidatura kept, dossier appended). Nothing else: the panel has no write credential and never writes to the Sheet itself, no other free text to bots, no approvals.

## Commands

```bash
pnpm dev                        # Dev server (localhost:3000)
pnpm build                      # Production build
pnpm lint                       # ESLint
pnpm lint:fix                   # ESLint with auto-fix
pnpm format                     # Prettier format all files
pnpm format:check               # Prettier check only

# Unit tests (Vitest + jsdom + React Testing Library)
pnpm test                       # Run all tests once
pnpm test:watch                 # Watch mode
pnpm test -- date-utils         # Run single test file by name
pnpm test:coverage              # Coverage report (v8)

# E2E tests (Playwright, Chromium only)
pnpm test:e2e                   # Run all E2E tests
pnpm test:e2e -- --grep "title" # Run E2E tests matching pattern
pnpm test:e2e:ui                # Playwright UI mode
pnpm test:e2e:debug             # Playwright debug mode
```

## Architecture

### Routing (App Router)

All dashboard pages live in `app/(dashboard)/` (layout = session guard + `Sidebar`):

- `/` — "Hoje" (Server Component): action queue. Hero with open-queue count and weekly goal ring, attention chips, ENVIO INCERTO alert, "Próxima jogada" (top of `todayQueue()`), queue, "No radar" and sent cards.
- `/analise` — KPIs, funnel, weekly series, distributions, source coverage, data quality. `?periodo=30d|90d` filters by `data_primeira_analise`.
- `/vagas` — Job list: server page projects `JobView[]` with `toListItem()` and hands the slim rows to the client `JobsExplorer`; filters live in the URL (`parseFilters`/`filtersToParams`).
- `/vaga/[job_id]` — Job detail (Server Component) over one `JobView`, handles FULL/PARTIAL/NONE/INVALID and unknown ids.
- `/configuracoes` — Weekly goal and theme.
- `/login` — Google sign-in (public). `/api/auth/*` — Auth.js handlers (public).

### Auth

Auth.js v5 (`auth.ts`), Google only, JWT sessions, allowlist `ALLOWED_EMAIL` (fails closed). Rules are pure functions in `lib/auth/access.ts`. Three independent gates, keep all of them:

- `proxy.ts` (Next 16 name for middleware) runs the `authorized` callback on every request except build assets and `public/` files: pages redirect to `/login`, `/api/*` gets 401.
- `app/(dashboard)/layout.tsx` calls `requireAllowedSession()`; every new dashboard page goes inside `app/(dashboard)/`.
- `getJobSearchData()` refuses the real Sheet without an allowed session. Any future server action or route handler must call `getAllowedSession()` itself — the proxy does not protect Server Functions.

Bot dispatch (`app/actions/ops.ts`: `startDispatch`, `listDispatches`, `ackDispatch`, `registerWriteset`, `startIntake`, `analyzeIntake`, `discardDispatch`, `declineJob`, `deleteJob`, `analyzeJob`, `resumeCv`) follows the same rule: every action calls `getAllowedSession()` first. Pages read `getJobSearchData()` directly. "Sincronizar" is `app/actions/job-search.ts` (`getAllowedSession()` + `updateTag`). Data links use `prefetch={false}` (each prefetch is a full dynamic render).

`proxy.ts` only reads the session: it strips the session `Set-Cookie` that Auth.js re-issues on every JWT `auth()` call (`session.updateAge` does not apply to JWT), otherwise any response sent with the old cookie that lands after "Sair" sets it again. The cookie is written only by sign-in and sign-out, so a session lasts `maxAge` (7 days) from sign-in, with no sliding renewal. Do not go back to `export { auth as proxy }`.

### Core Libraries (`lib/`)

- `job-search/` — Read-only data layer over the registry Sheet: header-based parsing, dossier/1 zod schema and sha256 checks, `JobView` derivation, pure metrics, Sheets API client and the cached `getJobSearchData()` (`source.ts`, server-only). Enums mirror job-search exactly; never extend or coerce them.
- `job-search/fixtures/snapshot.json` — Fixture generated by `scripts/generate-job-search-fixture.py` from job-search's own contract code; regenerate it when the contract changes.
- `job-search/present.ts` — Presentation helpers over `JobView` (list projection, filters, tones, attention groups, periods, safe links, UTC date formatting, visual state `jobState()`, application trail, interest flames, `todayQueue()`). Labels, colors and order only; never recompute job-search rules.
- `ops/` — Bot dispatch. `dispatcher.ts` (server-only) runs `<JOB_SEARCH_REPO>/hermes/browsers/dispatch.py` with `execFile`, fixed argv and a minimal env; `schema.ts` validates its JSON with zod; `present.ts` holds labels, `jobDispatchBlocker()` (UX gating only; the dispatcher and the bots are the authority), `withRegistration()` (adds the read-only Sheet snapshot to the "registro na planilha" stage) and `canRegisterWriteset()`; `platform-pref.ts` is the per-browser Hermes/Grok choice. Actions: BUSCAR_VAGAS (Lince → Threadgist/ChatGPT → writeset; persisted by the coordinator or, on the user's request, by "Registrar na planilha" = `registerWriteset(searchId)` → `dispatch.py persist`, a REGISTRAR_WRITESET record on platform `host`; the panel re-reads the Sheet when it sees it finish), GERAR_CURRICULO (CVerino → Curriculinho), PREENCHER_CANDIDATURA (Candidatinho, stops before submit), and the "vaga indicada" (Hermes only, "Indicar vaga" next to "Nova busca"): LOCALIZAR_VAGA (`startIntake(text)`: the Lince finds that one job and runs the prefilter, then stops; not found or ambiguous = NEEDS_CONTEXT, the user rewrites), ANALISAR_INDICADA (`analyzeIntake(id)` = `start … --from <id>`: Lince → Threadgist/ChatGPT → writeset in the same op dir; a BLOQUEIO_GRAVE prefilter only warns), then "Registrar na planilha" (`persist` accepts the analysis id) or "Descartar" (`discardDispatch(id)` = `dispatch.py discard`: marks the records only, nothing goes to the Sheet). `intake.ts` mirrors the dispatcher's text guards (NFKC, no control characters, 10–1500 code points, no approval pattern, `[painel:` or contract marker); `canAnalyzeIntake()`/`canDiscard()` are UX gating; the diagnosis shown is `writeset.py rows`, never recomputed; Lince fields render as text, links only via `safeHttpUrl`. `runDispatcher` takes an optional `stdin` and always closes it. "Descartar vaga" (`declineJob(jobId)` = `dispatch.py decline <job_id>`, synchronous, no dispatch record): `canDeclineJob()` is UX gating (not sent, uncertain or RETIRADA); the visual state `descartada` (`jobState()`) is RETIRADA whose last `CLOSED` event has `evidencia = USER_DECLINED` (`isUserDeclined()`), other RETIRADA stay `retirada`. "Excluir vaga" (`deleteJob(jobId)` = `dispatch.py delete-job <job_id>`, synchronous, only on the job detail): `canDeleteJob()` is UX gating (not sent or uncertain, not an archive-only row; RETIRADA allowed); the dialog enables "Excluir" only when the typed text is the job_id (`deleteJobConfirmed()`); success returns only the job_id and row counts (`deleteJobResultSchema`) and goes to `/vagas`; `deleteJobRefusalText()` words the shared codes for deleting, and `DELETE_PARTIAL`, `DELETE_UNCERTAIN` and `DISPATCHER_UNAVAILABLE` tell the user to sync and check (rows may be gone); the Sheet cache is dropped whatever the answer. "Analisar" (`analyzeJob(jobId)` = `start ANALISAR_VAGA --platform hermes --job-id <id>`, job-search host pipeline, Hermes only, no platform toggle): stages planilha → posting → ChatGPT → writeset → registro; works on any job in the Sheet, sent ones included (`analyzeJobBlocker()` only blocks while one runs; `CHATGPT_BUSY` comes from the dispatcher); the button reads "Refazer análise" when the job has a valid dossier; `POSTING_UNAVAILABLE` (no posting anywhere) ends in PRECISA_HUMANO; the card reuses the diagnosis and "Registrar na planilha". "Gerar currículo" stuck (`resumeCv(id, choice)` = `dispatch.py resume-cv <id> --option claude|chatgpt [--note-stdin]`): the card renders `progress.recovery` as job-search sends it (reason, the skill's `MOTIVO`, the end of the Claude panel reply, ChatGPT doubts, all plain text), the offered options as radios and "Outro" last (= `chatgpt` with the note over stdin, `normalizeIntake` guards, `resumeCvRefusalText()` words them); `canResumeCv()` is UX gating; job-search starts a new run and retires the stuck card (`retried_by`). Grok has no programmatic channel: grok dispatches return the fixed command to paste.
- `weekly-goal.ts` — Weekly application goal, a per-browser preference in `localStorage` (default 5). Not job-search data.
- `date-utils.ts` — Date helpers (`getDataInscricao()` returns midnight-based YYYY-MM-DD).
- `utils.ts` — `cn()` and badge/number helpers.

### Component Patterns

- `components/ui/` — Radix UI primitives (shadcn/ui style). Use `cn()` from `lib/utils.ts` for className merging.
- `components/job-search/` — Dashboard components (overview cards, list explorer, detail sections, badges). They receive data as props; there is no editable vaga state. `visual.tsx` holds the job visual language (state badge, flames, trail, `JobCard`); the list shows cards by default with a table toggle (per-browser preference).
- Charts: recharts with `--series-*` / `--chart-*` tokens from `globals.css` (dataviz palette slots validated on the card surfaces); every chart has a table view.
- Untrusted text (analysis, postings) is rendered as plain text, never as HTML.

### Styling

CSS variables defined in `app/globals.css` with light/dark themes ("limão sobre ameixa": plum ink dark default, warm paper light). Uses Tailwind CSS 4 with `@import "tailwindcss"` syntax. Theme toggled via `next-themes` (default: dark). Color tokens use space-separated RGB values (e.g., `--primary: 200 241 105`). Job state colors are `--st-{open,review,sent,uncertain,info,closed}` (fill) with `-ink` (text on fill) and `-fg` (text on surfaces), exposed as `bg-st-open`, `text-st-open-fg` etc.; always pair state color with an icon and label. Headings and big numbers use `font-display` (Bricolage Grotesque).

## Key Domain Concepts

- **Sources of truth**: methodology/enums live in the `job-search` Git repo; job state lives in the registry Sheet; structured job analysis arrives through the Sheet `Dossiers` tab. See the plan for the exact contract.

## Environment Variables

See `.env.example`. `JOB_SEARCH_DATA_SOURCE` defaults to the fixture; the real Sheet needs `JOB_SEARCH_DATA_SOURCE=sheets`, `JOB_SEARCH_SHEET_ID` and a read-only service account (`GOOGLE_SA_JSON_PATH` outside the repo, or `GOOGLE_SA_JSON_B64`). Never commit or print credentials. Auth needs `ALLOWED_EMAIL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (plus `AUTH_TRUST_HOST=true`, required for local `next start`; the Google OAuth client redirect URI is `http://localhost:3000/api/auth/callback/google`). Reading the real Sheet requires an allowed session (`UNAUTHENTICATED` otherwise), on any host. Bot dispatch is off unless `JOB_SEARCH_DISPATCH_ENABLED=true` and `JOB_SEARCH_REPO` (absolute path of the job-search checkout) are set; `JOB_SEARCH_DISPATCH_PYTHON` defaults to `python3`.

## Testing Notes

- Unit tests: `__tests__/` directory mirrors source structure. Use `waitFor` for async assertions (not `waitForNextUpdate`).
- E2E tests: `e2e/` directory, Chromium only, 1 worker against `localhost:3000`.
- E2E bot dispatch: `e2e/ops-env.ts` points the server at a fake dispatcher (`e2e/fixtures/job-search-fake`, same CLI/JSON, advances one stage per `list`); a reused server needs those variables too.
- E2E auth: no app-side bypass. The server under test runs with the throwaway `E2E_AUTH_ENV` from `e2e/auth.ts` (Playwright `webServer.env`), and specs mint the session cookie with `signInAs()`. A reused server (e.g. `pnpm build && pnpm start`) must be started with those same variables in its environment, or authenticated specs fail.
- Async Server Components: prefer E2E tests over Vitest unit tests.
- Test files: `__tests__/**/*.test.{ts,tsx}` and `lib/**/__tests__/**/*.test.{ts,tsx}` (Vitest include patterns).
- `next.config.mjs` sets `typescript.ignoreBuildErrors`, so `pnpm build` does not type-check: run `pnpm exec tsc --noEmit` as well.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`): lint, format check, unit tests, E2E tests, build, coverage upload (Codecov). Uses JSON reporters with GitHub Summaries.

## Deployment

None. The dashboard is local-first and no production deploy is configured. Do not add hosting-specific code (`@vercel/*`, `process.env.VERCEL`, `vercel.json`) or a database.
