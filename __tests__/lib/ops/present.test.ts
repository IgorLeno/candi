import { describe, expect, it } from "vitest"
import {
  analyzeJobBlocker,
  canConfirmOpen,
  canDeclineJob,
  canDeleteJob,
  canMarkClosed,
  canRecordSent,
  canRegisterWriteset,
  canResumeCv,
  confirmOpenRefusalText,
  deleteJobConfirmed,
  deleteJobRefusalText,
  latest,
  leftOutBlocker,
  markClosedRefusalText,
  recordSentRefusalText,
  leftOutKindLabel,
  needsUser,
  persistSummary,
  refusalText,
  resumeCvRefusalText,
  searchVerb,
  statusBadge,
  withRegistration,
} from "@/lib/ops/present"
import {
  deleteJobResultSchema,
  dispatchSchema,
  startInputSchema,
  type Dispatch,
  type DispatchProgress,
} from "@/lib/ops/schema"

const cell = (value: string | null, invalid = false) => ({ value, invalid, tone: "neutral" as const })

const open = {
  statusAnalise: cell("SELECIONADA"),
  statusDisponibilidade: cell("ABERTA"),
  statusCandidatura: cell("NÃO INICIADA"),
  archived: false,
  uncertainSubmit: false,
}

describe("canDeclineJob", () => {
  it("allows any job whose application was not sent, uncertain or withdrawn", () => {
    expect(canDeclineJob(open)).toBe(true)
    expect(canDeclineJob({ ...open, statusCandidatura: cell("PRONTA PARA REVISÃO") })).toBe(true)
    expect(canDeclineJob({ ...open, statusCandidatura: cell(null) })).toBe(true)
  })

  it("refuses sent, uncertain, withdrawn and invalid statuses", () => {
    for (const status of ["ENVIADA", "ENVIO INCERTO", "RETIRADA"]) {
      expect(canDeclineJob({ ...open, statusCandidatura: cell(status) })).toBe(false)
    }
    expect(canDeclineJob({ ...open, uncertainSubmit: true })).toBe(false)
    expect(canDeclineJob({ ...open, statusCandidatura: cell("NãO INICIADA", true) })).toBe(false)
  })
})

describe("canDeleteJob", () => {
  it("allows any job in the main tab whose application was not sent or uncertain, withdrawn ones included", () => {
    for (const status of ["NÃO INICIADA", "PRONTA PARA REVISÃO", "RETIRADA", null]) {
      expect(canDeleteJob({ ...open, statusCandidatura: cell(status) })).toBe(true)
    }
  })

  it("refuses sent, uncertain, invalid statuses and rows from the archive tab", () => {
    for (const status of ["ENVIADA", "ENVIO INCERTO"]) {
      expect(canDeleteJob({ ...open, statusCandidatura: cell(status) })).toBe(false)
    }
    expect(canDeleteJob({ ...open, uncertainSubmit: true })).toBe(false)
    expect(canDeleteJob({ ...open, statusCandidatura: cell("NãO INICIADA", true) })).toBe(false)
    expect(canDeleteJob({ ...open, archived: true })).toBe(false)
  })
})

describe("deleteJobConfirmed", () => {
  it("needs the exact job_id typed (surrounding spaces ignored)", () => {
    expect(deleteJobConfirmed("4450471269", "4450471269")).toBe(true)
    expect(deleteJobConfirmed(" 4450471269 ", "4450471269")).toBe(true)
    for (const typed of ["", "445047126", "44504712690", "excluir", "4450471269x"]) {
      expect(deleteJobConfirmed(typed, "4450471269")).toBe(false)
    }
  })
})

describe("deleteJobRefusalText", () => {
  it("speaks of deleting, and sends the user to check the Sheet whenever rows may be gone", () => {
    expect(deleteJobRefusalText("ALREADY_SENT")).toMatch(/excluir/)
    expect(deleteJobRefusalText("SUBMIT_UNCERTAIN")).toMatch(/excluir/)
    for (const code of ["DELETE_PARTIAL", "DELETE_UNCERTAIN", "DISPATCHER_UNAVAILABLE"]) {
      expect(deleteJobRefusalText(code)).toMatch(/confira/)
    }
    expect(deleteJobRefusalText("BACKUP_FAILED")).toMatch(/nada foi apagado/i)
    expect(deleteJobRefusalText("UNAUTHENTICATED")).toBe(refusalText("UNAUTHENTICATED"))
    expect(deleteJobRefusalText("NOVO_CODIGO")).toBe(refusalText("NOVO_CODIGO"))
  })
})

describe("canConfirmOpen", () => {
  const unconfirmed = { ...open, statusDisponibilidade: cell("NÃO CONFIRMADA") }

  it("allows a NÃO CONFIRMADA or ENCERRADA job in the main tab not sent, uncertain or withdrawn", () => {
    expect(canConfirmOpen(unconfirmed)).toBe(true)
    expect(canConfirmOpen({ ...unconfirmed, statusCandidatura: cell("PRONTA PARA REVISÃO") })).toBe(true)
    // The automatic read can mark an open job ENCERRADA (Gupy id read as LinkedIn): the user may reopen it.
    expect(canConfirmOpen({ ...open, statusDisponibilidade: cell("ENCERRADA") })).toBe(true)
  })

  it("refuses open, invalid, archived, sent, uncertain and withdrawn jobs", () => {
    expect(canConfirmOpen(open)).toBe(false)
    expect(canConfirmOpen({ ...open, statusDisponibilidade: cell("ENCERRADA"), archived: true })).toBe(false)
    expect(
      canConfirmOpen({ ...open, statusDisponibilidade: cell("ENCERRADA"), statusCandidatura: cell("ENVIADA") })
    ).toBe(false)
    expect(canConfirmOpen({ ...open, statusDisponibilidade: cell("NãO CONFIRMADA", true) })).toBe(false)
    expect(canConfirmOpen({ ...unconfirmed, archived: true })).toBe(false)
    expect(canConfirmOpen({ ...unconfirmed, uncertainSubmit: true })).toBe(false)
    for (const status of ["ENVIADA", "ENVIO INCERTO", "RETIRADA"]) {
      expect(canConfirmOpen({ ...unconfirmed, statusCandidatura: cell(status) })).toBe(false)
    }
  })
})

describe("canMarkClosed", () => {
  it("allows an ABERTA or NÃO CONFIRMADA job in the main tab not sent, uncertain or withdrawn", () => {
    expect(canMarkClosed(open)).toBe(true)
    expect(canMarkClosed({ ...open, statusDisponibilidade: cell("NÃO CONFIRMADA") })).toBe(true)
    expect(canMarkClosed({ ...open, statusCandidatura: cell("EM PREPARAÇÃO") })).toBe(true)
  })

  it("refuses closed, invalid, archived, sent, uncertain and withdrawn jobs", () => {
    expect(canMarkClosed({ ...open, statusDisponibilidade: cell("ENCERRADA") })).toBe(false)
    expect(canMarkClosed({ ...open, statusDisponibilidade: cell("ABERTX", true) })).toBe(false)
    expect(canMarkClosed({ ...open, archived: true })).toBe(false)
    expect(canMarkClosed({ ...open, uncertainSubmit: true })).toBe(false)
    for (const status of ["ENVIADA", "ENVIO INCERTO", "RETIRADA"]) {
      expect(canMarkClosed({ ...open, statusCandidatura: cell(status) })).toBe(false)
    }
  })

  it("words its own codes and reuses the confirm-open ones", () => {
    expect(markClosedRefusalText("ALREADY_CLOSED")).toMatch(/já está ENCERRADA/)
    expect(markClosedRefusalText("DOSSIER_NOT_VALID")).toBe(confirmOpenRefusalText("DOSSIER_NOT_VALID"))
  })
})

describe("canRecordSent", () => {
  it("allows any job in the main tab not sent or uncertain, discarded ones included", () => {
    for (const status of ["NÃO INICIADA", "EM PREPARAÇÃO", "PRONTA PARA REVISÃO", "RETIRADA", null]) {
      expect(canRecordSent({ ...open, statusCandidatura: cell(status) })).toBe(true)
    }
  })

  it("refuses sent, uncertain, archived and invalid", () => {
    for (const status of ["ENVIADA", "ENVIO INCERTO"]) {
      expect(canRecordSent({ ...open, statusCandidatura: cell(status) })).toBe(false)
    }
    expect(canRecordSent({ ...open, uncertainSubmit: true })).toBe(false)
    expect(canRecordSent({ ...open, archived: true })).toBe(false)
    expect(canRecordSent({ ...open, statusCandidatura: cell("ENVIADX", true) })).toBe(false)
  })

  it("words its own codes and falls back to the shared ones", () => {
    expect(recordSentRefusalText("ALREADY_SENT")).toMatch(/já está registrado/)
    expect(recordSentRefusalText("RECORD_UNCERTAIN")).toMatch(/Sincronize/)
    expect(recordSentRefusalText("DISPATCHER_UNAVAILABLE")).toBe(refusalText("DISPATCHER_UNAVAILABLE"))
  })
})

describe("open-browser refusals", () => {
  it("word every open-browser code and point the closed Chrome to the button", () => {
    expect(refusalText("CLOUDDESIGN_CDP_DOWN")).toMatch(/abra o navegador do currículo/)
    expect(refusalText("CLOUDDESIGN_OPEN_NO_CDP")).toMatch(/feche essa janela/)
    expect(refusalText("CLOUDDESIGN_OPEN_FAILED")).toMatch(/Cloud Design Browser/)
    expect(refusalText("NO_GRAPHICAL_SESSION")).toMatch(/sessão gráfica/)
    expect(refusalText("BROWSER_INVALID")).toMatch(/Navegador/)
    expect(refusalText("APPLICATION_CDP_DOWN")).toMatch(/abra o navegador da candidatura/)
    expect(refusalText("APPLICATION_OPEN_NO_CDP")).toMatch(/feche essa janela/)
    expect(refusalText("APPLICATION_OPEN_FAILED")).toMatch(/Application Browser/)
  })
})

describe("confirmOpenRefusalText", () => {
  it("words shared codes for the confirmation and falls back to the common text", () => {
    expect(confirmOpenRefusalText("JOB_DISPATCH_ACTIVE")).toMatch(/confirmar/)
    expect(confirmOpenRefusalText("ALREADY_OPEN")).toMatch(/já está ABERTA/)
    expect(confirmOpenRefusalText("OPEN_UNCERTAIN")).toMatch(/confira/)
    expect(confirmOpenRefusalText("UNAUTHENTICATED")).toBe(refusalText("UNAUTHENTICATED"))
    expect(confirmOpenRefusalText("NOVO_CODIGO")).toBe(refusalText("NOVO_CODIGO"))
  })
})

const searchProgress: DispatchProgress = {
  percent: 76,
  stages: [
    { key: "busca", label: "Busca", state: "done" },
    { key: "analise", label: "Análise", state: "done" },
    { key: "writeset", label: "Writeset", state: "done" },
    { key: "registro", label: "Registro", state: "active", note: "pendente de persistência" },
  ],
  writeset_job_ids: ["a", "b"],
  writeset_path: "runtime/operations/x/writeset.md",
}

describe("analyzeJobBlocker", () => {
  it("only blocks while an analysis of the job is running (sent jobs included)", () => {
    expect(analyzeJobBlocker(null)).toBeNull()
    expect(analyzeJobBlocker({ active: false })).toBeNull()
    expect(analyzeJobBlocker({ active: true })).toBe("Análise desta vaga em andamento.")
  })
})

describe("withRegistration", () => {
  it("keeps the registration stage pending while the Sheet lacks writeset jobs", () => {
    const partial = withRegistration(searchProgress, new Set(["a"]))
    expect(partial.stages[3]).toMatchObject({
      state: "active",
      note: "pendente de persistência · 1 de 2 na planilha",
    })
    expect(partial.percent).toBe(76)
  })

  it("closes the last stage at 100% once every writeset job is in the Sheet", () => {
    const done = withRegistration(searchProgress, new Set(["a", "b", "c"]))
    expect(done.stages[3]).toMatchObject({ state: "done", note: "2 de 2 na planilha" })
    expect(done.percent).toBe(100)
  })

  it("does nothing before the writeset exists", () => {
    const early = { ...searchProgress, writeset_path: null, writeset_job_ids: [] }
    expect(withRegistration(early, new Set(["a"]))).toBe(early)
  })

  it("keeps the dispatcher's done state when it persisted, before the Sheet is read again", () => {
    const persisted: DispatchProgress = {
      ...searchProgress,
      stages: searchProgress.stages.map((stage) =>
        stage.key === "registro" ? { ...stage, state: "done", note: "gravado pelo job-search" } : stage
      ),
    }
    const out = withRegistration(persisted, new Set())
    expect(out.stages[3]).toMatchObject({ state: "done", note: "gravado pelo job-search · 0 de 2 na planilha" })
    expect(out.percent).toBe(100)
  })
})

describe("statusBadge", () => {
  const registered = (status: "CONCLUIDO" | "FALHOU" | "RODANDO") => ({
    ...searchProgress,
    registration: { id: "d-20260929T130000Z-abcdef", status, code: null, result: null },
  })

  it("shows a failed search whose writeset was later registered as recovered", () => {
    expect(statusBadge("FALHOU", registered("CONCLUIDO"))).toEqual({
      label: "Recuperada",
      tone: "warning",
      recovered: true,
    })
  })

  it("keeps Falhou while the registration did not conclude", () => {
    expect(statusBadge("FALHOU", searchProgress)).toEqual({ label: "Falhou", tone: "critical", recovered: false })
    expect(statusBadge("FALHOU", registered("FALHOU")).label).toBe("Falhou")
    expect(statusBadge("FALHOU", registered("RODANDO")).label).toBe("Falhou")
  })

  it("leaves other statuses alone", () => {
    expect(statusBadge("CONCLUIDO", registered("CONCLUIDO"))).toEqual({
      label: "Concluído",
      tone: "good",
      recovered: false,
    })
    expect(statusBadge("INCERTO", registered("CONCLUIDO")).label).toBe("Incerto")
  })
})

describe("canRegisterWriteset", () => {
  const registration = (status: "PENDENTE" | "RODANDO" | "CONCLUIDO" | "FALHOU") => ({
    id: "d-20260929T130000Z-abcdef",
    status,
    code: null,
    result: null,
  })

  it("offers the button only for a pending writeset with no persistence running", () => {
    expect(canRegisterWriteset(searchProgress)).toBe(true)
    expect(canRegisterWriteset({ ...searchProgress, writeset_path: null })).toBe(false)
    expect(canRegisterWriteset({ ...searchProgress, registration: registration("RODANDO") })).toBe(false)
    expect(canRegisterWriteset({ ...searchProgress, registration: registration("PENDENTE") })).toBe(false)
    // A failed persistence can be retried (writeset.py persist is idempotent).
    expect(canRegisterWriteset({ ...searchProgress, registration: registration("FALHOU") })).toBe(true)
    // Already in the Sheet (panel snapshot) or persisted by the dispatcher: no button.
    expect(canRegisterWriteset(withRegistration(searchProgress, new Set(["a", "b"])))).toBe(false)
  })

  it("summarizes persistence counts only", () => {
    expect(persistSummary(null)).toBeNull()
    expect(persistSummary({ jobs: { INSERTED: 2, UPDATED: 1, UNCHANGED: 0 }, coverage: null, dossiers: null })).toBe(
      "2 novas, 1 atualizadas, 0 sem mudança"
    )
  })
})

describe("Cotar vagas: searchVerb and needsUser", () => {
  const search = dispatchSchema.parse({
    id: "d-20261002T120000Z-abcdef",
    action: "BUSCAR_VAGAS",
    platform: "hermes",
    mode: "bot",
    job_id: null,
    status: "CONCLUIDO",
    code: null,
    marker: null,
    acknowledged: false,
    created_at: "2026-10-02T12:00:00Z",
    finished_at: "2026-10-02T12:30:00Z",
    bot: "Lince",
    active: false,
    progress: { ...searchProgress, writeset_path: null, writeset_job_ids: [] },
  })

  it('reads "Cotar vagas" before the first search and "Nova cotação" after', () => {
    expect(searchVerb(null)).toBe("Cotar vagas")
    expect(searchVerb(search)).toBe("Nova cotação")
  })

  it("keeps a card on screen while it runs, waits for the user or holds an unregistered writeset", () => {
    expect(needsUser(null)).toBe(false)
    expect(needsUser(search)).toBe(false)
    expect(needsUser({ ...search, status: "RODANDO", active: true })).toBe(true)
    expect(needsUser({ ...search, status: "PRECISA_HUMANO" })).toBe(true)
    expect(needsUser({ ...search, progress: searchProgress })).toBe(true)
    // Already in the Sheet snapshot: the toggle hides it again.
    expect(needsUser(search, withRegistration(searchProgress, new Set(["a", "b"])))).toBe(false)
    expect(needsUser({ ...search, status: "FALHOU" })).toBe(false)
    expect(needsUser({ ...search, status: "PRECISA_HUMANO", discarded: true })).toBe(false)
  })
})

describe("canResumeCv", () => {
  const recovery = {
    reason: "O Claude in Chrome parou sem exportar o PDF.",
    claude_reason: null,
    claude_reply: "posso reduzir o grid?",
    doubts: [],
    options: [
      { key: "claude", label: "Refazer só a edição no Claude", description: "mesmo patch" },
      { key: "chatgpt", label: "Refazer o patch no ChatGPT", description: "patch novo" },
    ],
    note_allowed: true,
  }
  const stuck = dispatchSchema.parse({
    id: "d-20261002T012510Z-abcdef",
    action: "GERAR_CURRICULO",
    platform: "hermes",
    mode: "host",
    job_id: "1",
    status: "PRECISA_HUMANO",
    code: "BLOCKED_CLAUDE_CHROME:CLAUDE_STOPPED_WITHOUT_PDF",
    marker: null,
    acknowledged: false,
    created_at: "2026-10-02T01:25:00Z",
    finished_at: "2026-10-02T01:29:00Z",
    bot: "ChatGPT + Claude in Chrome (host)",
    active: false,
    progress: { percent: 40, stages: [], recovery },
    resumes: null,
    resume_option: null,
    retried_by: null,
  })

  it("offers the resume only on a host run stuck on the user, once", () => {
    expect(canResumeCv(stuck)).toBe(true)
    expect(canResumeCv({ ...stuck, retried_by: "d-20261002T013000Z-abcdef" })).toBe(false)
    expect(canResumeCv({ ...stuck, status: "FALHOU" })).toBe(false)
    expect(canResumeCv({ ...stuck, mode: "bot" })).toBe(false)
    expect(canResumeCv({ ...stuck, progress: { ...stuck.progress, recovery: null } })).toBe(false)
  })

  it("reads prompt_stale only as a boolean", () => {
    const application = { ...stuck, action: "PREENCHER_CANDIDATURA", code: "PASTE_PROMPT_IN_CLAUDE" }
    const parse = (patch: object) =>
      dispatchSchema.safeParse({ ...application, progress: { percent: 80, stages: [], ...patch } })
    expect(parse({ claude_prompt: "x", prompt_stale: true }).success).toBe(true)
    expect(parse({ claude_prompt: "x" }).success).toBe(true)
    expect(parse({ claude_prompt: "x", prompt_stale: "sim" }).success).toBe(false)
  })

  it("rejects options and texts outside the contract", () => {
    const bad = (patch: object) =>
      dispatchSchema.safeParse({ ...stuck, progress: { ...stuck.progress, recovery: { ...recovery, ...patch } } })
    expect(bad({}).success).toBe(true)
    expect(bad({ options: [{ key: "aprovar", label: "x", description: "y" }] }).success).toBe(false)
    expect(bad({ options: [] }).success).toBe(false)
    expect(bad({ claude_reply: "x".repeat(601) }).success).toBe(false)
    expect(bad({ doubts: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false)
  })

  it("words the note guards for the résumé and keeps the shared texts", () => {
    expect(resumeCvRefusalText("INTAKE_INVALID")).toMatch(/^O texto precisa/)
    expect(resumeCvRefusalText("ALREADY_RESUMED")).toBe(refusalText("ALREADY_RESUMED"))
    expect(refusalText("ALREADY_RESUMED")).not.toMatch(/recusado/)
  })
})

describe("schema", () => {
  it("requires jobId exactly for per-job actions and rejects extra fields", () => {
    expect(startInputSchema.safeParse({ action: "BUSCAR_VAGAS", platform: "hermes" }).success).toBe(true)
    expect(startInputSchema.safeParse({ action: "BUSCAR_VAGAS", platform: "hermes", jobId: "1" }).success).toBe(false)
    expect(startInputSchema.safeParse({ action: "GERAR_CURRICULO", platform: "grok" }).success).toBe(false)
    expect(startInputSchema.safeParse({ action: "GERAR_CURRICULO", platform: "grok", jobId: "../x" }).success).toBe(
      false
    )
    expect(
      startInputSchema.safeParse({ action: "PREENCHER_CANDIDATURA", platform: "hermes", jobId: "1", text: "ok" })
        .success
    ).toBe(false)
    expect(startInputSchema.safeParse({ action: "APROVAR", platform: "hermes" }).success).toBe(false)
    // Persistence is not a bot action: only `registerWriteset` asks for it.
    expect(startInputSchema.safeParse({ action: "REGISTRAR_WRITESET", platform: "hermes" }).success).toBe(false)
  })

  it("parses a dispatcher record and picks the latest per action", () => {
    const raw = {
      id: "d-20260929T120000Z-abcdef",
      action: "GERAR_CURRICULO",
      platform: "hermes",
      job_id: "1",
      status: "RODANDO",
      code: null,
      marker: null,
      turns: 0,
      acknowledged: false,
      created_at: "2026-09-29T12:00:00Z",
      updated_at: "2026-09-29T12:00:00Z",
      delivered_at: null,
      finished_at: null,
      bot: "CVerino",
      active: true,
      progress: { percent: 5, stages: [], traffic: { pending: 0 }, handoff: null, cv: "MISSING" },
    }
    const parsed = dispatchSchema.parse(raw)
    const older: Dispatch = { ...parsed, id: "d-20260928T120000Z-abcdef" }
    expect(latest([parsed, older], "GERAR_CURRICULO")).toBe(parsed)
    expect(latest([parsed], "BUSCAR_VAGAS")).toBeNull()
  })

  it("parses an analysis record with its posting source and diagnosis", () => {
    const parsed = dispatchSchema.parse({
      id: "d-20260930T120000Z-abcdef",
      action: "ANALISAR_VAGA",
      platform: "hermes",
      job_id: "11132619",
      status: "CONCLUIDO",
      code: null,
      marker: "WRITESET_COMPLETE",
      created_at: "2026-09-30T12:00:00Z",
      finished_at: "2026-09-30T12:05:00Z",
      bot: "ChatGPT (host)",
      mode: "host",
      active: false,
      acknowledged: false,
      progress: {
        percent: 81,
        stages: [{ key: "registro", label: "Registro na planilha", state: "active" }],
        posting_source: "linkedin",
        writeset_path: "runtime/operations/d-20260930T120000Z-abcdef/writeset.md",
        writeset_job_ids: ["11132619"],
        diagnosis: [
          {
            job_id: "11132619",
            cargo: "Trainee",
            empresa: "Usiminas",
            status_analise: "SELECIONADA",
            interesse: "ALTO",
            motivo_analise: "Gate 4 aprovado",
          },
        ],
        diagnosis_by: "chatgpt",
        registration: null,
      },
    })
    expect(parsed.progress.posting_source).toBe("linkedin")
    expect(parsed.progress.diagnosis?.[0].motivo_analise).toBe("Gate 4 aprovado")
    expect(parsed.progress.diagnosis_by).toBe("chatgpt")
    expect(canRegisterWriteset(parsed.progress)).toBe(true)
  })

  it("parses a writeset persistence record and the registration inside a search", () => {
    const result = { jobs: { INSERTED: 1, UPDATED: 0, UNCHANGED: 1 }, coverage: null, dossiers: null }
    const record = dispatchSchema.parse({
      id: "d-20260929T130000Z-abcdef",
      action: "REGISTRAR_WRITESET",
      platform: "host",
      job_id: null,
      status: "CONCLUIDO",
      code: null,
      marker: null,
      bot: "job-search",
      active: false,
      acknowledged: false,
      created_at: "2026-09-29T13:00:00Z",
      finished_at: "2026-09-29T13:00:10Z",
      source_id: "d-20260929T120000Z-abcdef",
      result,
      progress: { percent: 100, stages: [] },
    })
    expect(record.result).toEqual(result)
    const search = { ...searchProgress, registration: { id: record.id, status: "CONCLUIDO", code: null, result } }
    expect(dispatchSchema.shape.progress.parse(search).registration?.result).toEqual(result)
    expect(
      dispatchSchema.shape.progress.safeParse({ ...search, registration: { ...search.registration, id: "../x" } })
        .success
    ).toBe(false)
  })
})

describe("refusalText", () => {
  it("explains known codes and falls back to the code", () => {
    expect(refusalText("GATEWAY_NOT_RUNNING")).toMatch(/Grok/)
    expect(refusalText("XYZ")).toBe("Disparo recusado (XYZ).")
    expect(refusalText("APPLICATION_CDP_DOWN")).toMatch(/CDP 9227/)
  })
})

describe("deleteJobResultSchema", () => {
  const ok = { ok: true, delete_job: { job_id: "4450471269", principal: 1, eventos: 3, dossiers: 0 } }

  it("accepts only the job_id and the three row counts", () => {
    expect(deleteJobResultSchema.parse(ok)).toEqual(ok)
    for (const delete_job of [
      { ...ok.delete_job, job_id: "../x" },
      { ...ok.delete_job, principal: "1" },
      { ...ok.delete_job, eventos: -1 },
      { ...ok.delete_job, dossiers: 1.5 },
      { job_id: "4450471269", principal: 1 },
    ]) {
      expect(deleteJobResultSchema.safeParse({ ok: true, delete_job }).success).toBe(false)
    }
  })
})

describe("vagas que ficaram de fora da cotação", () => {
  const job = {
    job_id: "4470000020",
    empresa: "ACME",
    cargo: "Estagiário",
    local: "BH",
    url: "https://www.linkedin.com/jobs/view/4470000020",
    fonte: "LinkedIn",
    motivo: "estágio/aprendiz",
    kind: "PREFILTRO",
    data: "",
    has_card: true,
    in_runtime: false,
  }

  it("o veredito nunca trava; só motivo técnico", () => {
    expect(leftOutBlocker(job, null)).toBeNull()
    expect(leftOutBlocker({ ...job, kind: "ENCERRADA" }, null)).toBeNull()
    expect(leftOutBlocker({ ...job, in_runtime: true }, null)).toMatch(/Já está no job-search/)
    expect(leftOutBlocker({ ...job, has_card: false }, null)).toMatch(/Cotação antiga/)
    const running = { active: true } as Dispatch
    expect(leftOutBlocker(job, running)).toMatch(/em andamento/)
  })

  it("rótulo do motivo", () => {
    expect(leftOutKindLabel("PREFILTRO")).toBe("Pré-filtro")
    expect(leftOutKindLabel("LIMITE")).toBe("Acima do limite da rodada")
    expect(leftOutKindLabel("BLOCKED_EXTRACTION")).toBe("Página não lida")
  })

  it("o schema aceita a lista no progresso da cotação e registros antigos sem ela", () => {
    const base = {
      id: "d-20261003T120000Z-abcdef",
      action: "BUSCAR_VAGAS",
      platform: "hermes",
      job_id: null,
      status: "CONCLUIDO",
      code: null,
      marker: null,
      bot: "x",
      active: false,
      acknowledged: false,
      created_at: "2026-10-03T12:00:00Z",
      finished_at: null,
    }
    const progress = { percent: 100, stages: [] }
    expect(dispatchSchema.safeParse({ ...base, progress }).success).toBe(true)
    const parsed = dispatchSchema.safeParse({
      ...base,
      progress: { ...progress, excluded_jobs: [job], deferred_jobs: [] },
    })
    expect(parsed.success && parsed.data.progress.excluded_jobs?.[0].kind).toBe("PREFILTRO")
    expect(dispatchSchema.safeParse({ ...base, action: "ANALISAR_DESCOBERTA", job_id: "1", progress }).success).toBe(
      true
    )
  })
})
