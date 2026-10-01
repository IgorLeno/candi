import { test, expect } from "@playwright/test"
import { E2E_AUTH_ENV, signInAs } from "./auth"
import { resetFakeDispatches } from "./ops-env"

// Bot dispatch against the fake job-search dispatcher (e2e/fixtures/job-search-fake): no bot, no gateway.
test.describe("Central de operações (bots)", () => {
  test.beforeEach(async ({ context, page }) => {
    resetFakeDispatches()
    await signInAs(context, E2E_AUTH_ENV.ALLOWED_EMAIL)
    // Platform preference is per browser; start every test on Hermes (once per tab, so reloads keep choices).
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("e2e-platform-init")) return
      window.sessionStorage.setItem("e2e-platform-init", "1")
      window.localStorage.setItem("estagios:plataforma-bots", "hermes")
    })
  })

  test("buscar vagas: confirmação, progresso por etapa e registro na planilha pelo job-search", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/")
    const ops = page.getByTestId("search-ops")
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)

    // Cancel never dispatches.
    await ops.getByTestId("dispatch-button-BUSCAR_VAGAS").click()
    await expect(page.getByTestId("dispatch-dialog")).toContainText("ChatGPT")
    await page.getByTestId("dispatch-cancel").click()
    await expect(ops.getByTestId("dispatch-BUSCAR_VAGAS")).toHaveCount(0)

    await ops.getByTestId("dispatch-button-BUSCAR_VAGAS").click()
    await page.getByTestId("dispatch-confirm").click()
    const card = ops.getByTestId("dispatch-BUSCAR_VAGAS")
    await expect(card).toBeVisible()
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toBeDisabled()

    // The fake finishes the bots' part. The writeset has fake-1001 (already in the fixture Sheet) and fake-9001
    // (not yet), so the registration stage stays open until the writeset is persisted.
    await expect(card).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    const registro = card.locator('[data-stage="registro"]')
    await expect(registro).toHaveAttribute("data-state", "active")
    await expect(registro).toContainText("pendente de persistência · 1 de 2 na planilha")
    await expect(card).toContainText("76%")
    const registration = card.getByTestId("writeset-registration")
    await expect(registration).toHaveAttribute("data-registration", "none")

    // Confirmation says who writes and how many jobs; cancel asks nothing.
    await registration.getByTestId("register-writeset").click()
    const dialog = page.getByTestId("register-dialog")
    await expect(dialog).toContainText("2 vagas")
    await expect(dialog).toContainText("credencial de escrita")
    await expect(dialog).toContainText("writeset.py check VALID")
    await page.getByTestId("register-cancel").click()
    await expect(registration).toHaveAttribute("data-registration", "none")

    await registration.getByTestId("register-writeset").click()
    await page.getByTestId("register-confirm").click()
    await expect(registration.getByTestId("register-writeset")).toHaveCount(0)
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(registro).toHaveAttribute("data-state", "done")
    await expect(registro).toContainText("gravado pelo job-search")
    await expect(card).toContainText("100%")
    await expect(registration).toContainText("gravado pelo job-search (1 novas, 0 atualizadas, 1 sem mudança)")
    // The panel reads the Sheet again once the persistence it watched finished.
    await expect(page.getByText("planilha relida")).toBeVisible()

    await page.goto("/vagas")
    await expect(page.getByTestId("search-ops").getByTestId("dispatch-BUSCAR_VAGAS")).toHaveAttribute(
      "data-status",
      "CONCLUIDO"
    )
  })

  test("vaga indicada: localizar, mandar para o ChatGPT e registrar na planilha", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/")
    const ops = page.getByTestId("search-ops")
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)

    // The same guards as the dispatcher explain a refusal before anything is sent; cancel sends nothing.
    await ops.getByTestId("intake-button").click()
    const dialog = page.getByTestId("intake-dialog")
    await expect(dialog).toContainText("não comando")
    await expect(dialog).toContainText("Roda sempre pelo Hermes")
    await expect(dialog.getByTestId("platform-toggle")).toHaveCount(0)
    const input = page.getByTestId("intake-input")
    await input.fill("curto")
    await expect(page.getByTestId("intake-confirm")).toBeDisabled()
    await input.fill("Estágio na Empresa Indicada, ok 1a2b3c4d")
    await expect(page.getByTestId("intake-problem")).toContainText("aprovação")
    await expect(page.getByTestId("intake-confirm")).toBeDisabled()
    await page.getByTestId("intake-cancel").click()
    await expect(ops.getByTestId("dispatch-LOCALIZAR_VAGA")).toHaveCount(0)

    const text = "Estágio em processos químicos na Empresa Indicada, Camaçari.\nLink: https://exemplo.com/vagas/9002"
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill(text)
    await expect(page.getByTestId("intake-count")).toHaveText(`${text.length}/1500`)
    await page.getByTestId("intake-confirm").click()
    const intake = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(intake).toBeVisible()
    await expect(intake.getByTestId("intake-text")).toHaveText(text)
    // Search and intake share the Lince: one at a time.
    await expect(ops.getByTestId("dispatch-button-BUSCAR_VAGAS")).toBeDisabled()
    await expect(ops.getByTestId("intake-button")).toBeDisabled()

    await expect(intake).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(intake.getByTestId("intake-job")).toContainText("Estágio em Processos Químicos · Empresa Indicada")
    await expect(intake.getByTestId("intake-link")).toHaveAttribute("href", "https://exemplo.com/vagas/9002")
    await expect(intake.getByTestId("intake-link")).toHaveAttribute("rel", /noopener/)
    await expect(intake.getByTestId("intake-prefilter")).toHaveAttribute("data-verdict", "BLOQUEIO_GRAVE")
    await expect(intake.getByTestId("intake-prefilter")).toContainText("pede formatura até 12/2026")

    // BLOQUEIO_GRAVE does not block the ChatGPT step: the dialog only warns.
    await intake.getByTestId("intake-analyze").click()
    const decision = page.getByTestId("intake-decision-dialog")
    await expect(decision).toContainText("bloqueio grave")
    await page.getByTestId("intake-decision-confirm").click()
    const analysis = ops.getByTestId("dispatch-ANALISAR_INDICADA")
    await expect(analysis).toBeVisible()
    await expect(intake.getByTestId("intake-analyze")).toHaveCount(0)
    await expect(intake.getByTestId("intake-discard")).toHaveCount(0)

    await expect(analysis).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(analysis.getByTestId("intake-diagnosis")).toContainText("SELECIONADA")
    await expect(analysis.getByTestId("intake-diagnosis")).toContainText("interesse ALTO")
    await expect(analysis.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "active")
    await expect(analysis.getByTestId("intake-discard")).toBeVisible()

    const registration = analysis.getByTestId("writeset-registration")
    await registration.getByTestId("register-writeset").click()
    await expect(page.getByTestId("register-dialog")).toContainText("1 vaga")
    await page.getByTestId("register-confirm").click()
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(analysis.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "done")
    // Recorded in the Sheet: no discard any more.
    await expect(analysis.getByTestId("intake-discard")).toHaveCount(0)

    await page.goto("/vagas")
    await expect(page.getByTestId("search-ops").getByTestId("intake-button")).toBeEnabled()
    await expect(page.getByTestId("search-ops").getByTestId("dispatch-ANALISAR_INDICADA")).toHaveAttribute(
      "data-status",
      "CONCLUIDO"
    )
  })

  test('vaga indicada: não localizada oferece candidatas ou "Outro"; descarte só no painel', async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(150_000)
    await page.goto("/vagas")
    const ops = page.getByTestId("search-ops")
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio na nao-existe S.A., cargo que ninguém anunciou")
    await page.getByTestId("intake-confirm").click()
    const missing = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(missing).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    await expect(missing.getByTestId("intake-reason")).toContainText("nenhuma vaga com essa descrição")
    await expect(missing.locator('[data-stage="localizar"]')).toHaveAttribute("data-state", "failed")
    await expect(missing).toContainText("NEEDS_CONTEXT")
    await expect(missing).toContainText("escolha a vaga acima")
    await expect(missing.getByTestId("intake-analyze")).toHaveCount(0)

    // The Lince's candidates plus "Outro" (always last); an unsafe link is not rendered.
    const refine = missing.getByTestId("intake-refine")
    await expect(refine.getByTestId("intake-candidate")).toHaveCount(2)
    await expect(refine.getByTestId("intake-candidate").first()).toContainText("Engenheiro Químico · Empresa Indicada")
    await expect(refine.getByTestId("intake-candidate-link")).toHaveCount(1)
    await expect(refine.getByTestId("intake-candidate-link")).toHaveAttribute("href", "https://exemplo.com/vagas/9101")
    await expect(refine.getByTestId("intake-refine-submit")).toBeDisabled()
    await refine.getByTestId("intake-candidate-other").click()
    const complement = refine.getByTestId("intake-refine-input")
    await complement.fill("é essa, ok 1a2b3c4d")
    await expect(refine.getByTestId("intake-refine-problem")).toContainText("aprovação")
    await expect(refine.getByTestId("intake-refine-submit")).toBeDisabled()
    const original = "Estágio na nao-existe S.A., cargo que ninguém anunciou"
    const room = 1500 - original.length - "\n\nComplemento:\n".length
    await complement.fill("a vaga é de engenheiro químico")
    await expect(refine.getByTestId("intake-refine-count")).toHaveText(`30/${room}`)
    await refine.getByTestId("intake-refine-submit").click()

    // One card: the new intake carries the original text plus the complement and is located.
    const refined = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(refined.getByTestId("intake-refines")).toBeVisible()
    await expect(refined.getByTestId("intake-text")).toContainText("Complemento:")
    await expect(refined.getByTestId("intake-text")).toContainText("a vaga é de engenheiro químico")
    await expect(refined).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(refined.getByTestId("intake-refine")).toHaveCount(0)
    await expect(refined.getByTestId("intake-job")).toBeVisible()
    await refined.getByTestId("intake-discard").click()
    await page.getByTestId("intake-decision-confirm").click()
    await expect(refined.getByTestId("dispatch-discarded")).toBeVisible()

    // A located job may be discarded before the ChatGPT step: nothing goes to the Sheet.
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio em processos químicos na Empresa Indicada, Camaçari")
    await page.getByTestId("intake-confirm").click()
    const located = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(located).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(located.getByTestId("intake-job")).toBeVisible()
    await located.getByTestId("intake-discard").click()
    await expect(page.getByTestId("intake-decision-dialog")).toContainText("Nada vai para a planilha")
    await page.getByTestId("intake-decision-cancel").click()
    await expect(located.getByTestId("dispatch-discarded")).toHaveCount(0)
    await located.getByTestId("intake-discard").click()
    await page.getByTestId("intake-decision-confirm").click()
    await expect(located.getByTestId("dispatch-discarded")).toBeVisible()
    await expect(located.getByTestId("intake-discard")).toHaveCount(0)
    await expect(located.getByTestId("intake-analyze")).toHaveCount(0)
    await expect(page.getByText("Nada foi para a planilha")).toBeVisible()
  })

  test("vaga: gerar currículo antes, depois preencher candidatura", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/vaga/fake-1001")
    const ops = page.getByTestId("job-ops")
    await expect(ops.getByTestId("cv-status")).toHaveText("Currículo não gerado")

    // Without a ready CV the application dialog recommends generating it first.
    await ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA").click()
    await expect(page.getByTestId("dispatch-dialog")).toContainText("ainda não está pronto")
    await expect(page.getByTestId("dispatch-dialog")).toContainText("Nenhuma candidatura é enviada")
    await page.getByTestId("dispatch-cancel").click()

    await ops.getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("dispatch-confirm").click()
    const cv = ops.getByTestId("dispatch-GERAR_CURRICULO")
    await expect(cv).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await page.reload()
    await expect(page.getByTestId("job-ops").getByTestId("cv-status")).toHaveText("Currículo pronto")

    await page.getByTestId("job-ops").getByTestId("dispatch-button-PREENCHER_CANDIDATURA").click()
    await expect(page.getByTestId("dispatch-dialog")).not.toContainText("ainda não está pronto")
    await page.getByTestId("dispatch-confirm").click()
    const application = page.getByTestId("job-ops").getByTestId("dispatch-PREENCHER_CANDIDATURA")
    await expect(application).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(application.locator('[data-stage="aprovacao"]')).toHaveAttribute("data-state", "done")
  })

  test("analisar vaga enviada: confirmação, etapas, diagnóstico e registro na planilha", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    // fake-1006 is ENVIADA and has no dossier: résumé and application are blocked, the analysis is not.
    await page.goto("/vaga/fake-1006")
    const ops = page.getByTestId("job-ops")
    await expect(ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA")).toBeDisabled()
    const button = ops.getByTestId("analyze-button")
    await expect(button).toBeEnabled()
    await expect(button).toHaveText("Analisar")

    // Cancel never dispatches; the dialog has no platform toggle (Hermes only).
    await button.click()
    const dialog = page.getByTestId("analyze-dialog")
    await expect(dialog).toContainText("fake-1006")
    await expect(dialog).toContainText("Candidatura, datas e observações não mudam")
    await expect(dialog.getByTestId("platform-grok")).toHaveCount(0)
    await page.getByTestId("analyze-cancel").click()
    await expect(ops.getByTestId("dispatch-ANALISAR_VAGA")).toHaveCount(0)

    await button.click()
    await page.getByTestId("analyze-confirm").click()
    const card = ops.getByTestId("dispatch-ANALISAR_VAGA")
    await expect(card).toBeVisible()
    await expect(ops.getByTestId("analyze-button")).toBeDisabled()
    await expect(card).toContainText("ChatGPT (host) · Hermes")

    await expect(card).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    for (const stage of ["planilha", "posting", "analise", "writeset"]) {
      await expect(card.locator(`[data-stage="${stage}"]`)).toHaveAttribute("data-state", "done")
    }
    await expect(card.getByTestId("analysis-diagnosis")).toContainText("NÃO PRIORIZADA")
    await expect(ops.getByTestId("analyze-button")).toBeEnabled()

    // Registration is the existing writeset flow: job-search writes, the panel only asks and re-reads.
    const registration = card.getByTestId("writeset-registration")
    await registration.getByTestId("register-writeset").click()
    await expect(page.getByTestId("register-dialog")).toContainText("1 vaga")
    await page.getByTestId("register-confirm").click()
    await expect(registration).toHaveAttribute("data-registration", "CONCLUIDO", { timeout: 20_000 })
    await expect(card.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "done")
  })

  test("analisar: vaga com dossier oferece refazer; vaga sem texto pede você", async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto("/vaga/fake-1001")
    await expect(page.getByTestId("job-ops").getByTestId("analyze-button")).toHaveText("Refazer análise")
    await page.getByTestId("job-ops").getByTestId("analyze-button").click()
    await expect(page.getByTestId("analyze-dialog")).toContainText("O dossier novo é anexado")
    await page.getByTestId("analyze-cancel").click()

    // fake-1008: no posting anywhere, so job-search stops and asks the user (never invents the text).
    await page.goto("/vaga/fake-1008")
    const ops = page.getByTestId("job-ops")
    await ops.getByTestId("analyze-button").click()
    await page.getByTestId("analyze-confirm").click()
    const card = ops.getByTestId("dispatch-ANALISAR_VAGA")
    await expect(card).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 20_000 })
    await expect(card.locator('[data-stage="posting"]')).toHaveAttribute("data-state", "failed")
    await expect(card).toContainText("POSTING_UNAVAILABLE")
    await expect(card).toContainText("não achou o texto desta vaga")
    await expect(card.getByTestId("writeset-registration")).toHaveCount(0)
  })

  test("grok: seletor de plataforma gera o comando para colar", async ({ page }) => {
    await page.goto("/vaga/fake-1001")
    await page.getByTestId("job-ops").getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await page.getByTestId("platform-grok").click()
    await expect(page.getByTestId("platform-grok")).toHaveAttribute("aria-checked", "true")
    await page.getByTestId("dispatch-confirm").click()
    await expect(page.getByTestId("dispatch-dialog").getByTestId("grok-command")).toContainText("[painel:dispatch")
    await page.getByTestId("dispatch-cancel").click()
    await expect(page.getByTestId("dispatch-GERAR_CURRICULO")).toHaveAttribute("data-status", "MANUAL")
    // The choice sticks for the next dispatch in this browser.
    await page.reload()
    await page.getByTestId("job-ops").getByTestId("dispatch-button-GERAR_CURRICULO").click()
    await expect(page.getByTestId("platform-grok")).toHaveAttribute("aria-checked", "true")
  })

  test("ENVIO INCERTO e vaga enviada não aceitam disparo", async ({ page }) => {
    for (const id of ["fake-1007", "fake-1006"]) {
      await page.goto(`/vaga/${id}`)
      const ops = page.getByTestId("job-ops")
      await expect(ops.getByTestId("dispatch-button-GERAR_CURRICULO")).toBeDisabled()
      await expect(ops.getByTestId("dispatch-button-PREENCHER_CANDIDATURA")).toBeDisabled()
    }
    await expect(page.getByTestId("job-ops")).toContainText("Candidatura já enviada.")
  })

  test("descartar vaga: confirmação, carimbo vermelho DESCARTADA e a vaga continua listada", async ({ page }) => {
    // The fake answers like job-search but cannot change the fixture Sheet: fake-1009 is already discarded there.
    await page.goto("/vaga/fake-1002")
    await page.getByTestId("decline-job").click()
    const dialog = page.getByTestId("decline-job-dialog")
    await expect(dialog).toContainText("RETIRADA")
    await expect(dialog).toContainText("Não dá para desfazer")
    await page.getByTestId("decline-job-cancel").click()
    await expect(dialog).toBeHidden()
    await page.getByTestId("decline-job").click()
    await page.getByTestId("decline-job-confirm").click()
    await expect(page.getByText("Vaga descartada e marcada como RETIRADA na planilha.")).toBeVisible()

    // A discarded job keeps its card: red state, "descartada" stamp, no discard button.
    await page.goto("/vaga/fake-1009")
    await expect(page.getByTestId("state-badge").first()).toHaveAttribute("data-state", "descartada")
    await expect(page.getByTestId("declined-stamp")).toHaveText("descartada")
    await expect(page.getByTestId("decline-job")).toHaveCount(0)
    // Sent and uncertain applications cannot be discarded.
    for (const id of ["fake-1006", "fake-1007"]) {
      await page.goto(`/vaga/${id}`)
      await expect(page.getByTestId("job-detail")).toBeVisible()
      await expect(page.getByTestId("decline-job")).toHaveCount(0)
    }

    // "Hoje": the queue offers the button; the discarded job leaves the queue but stays on its own shelf.
    await page.goto("/")
    await expect(page.getByTestId("queue-list").getByTestId("decline-job").first()).toBeVisible()
    await expect(page.getByTestId("queue-list").locator('[data-job-id="fake-1009"]')).toHaveCount(0)
    const declined = page.getByTestId("declined-list").locator('[data-job-id="fake-1009"]')
    await expect(declined).toHaveAttribute("data-state", "descartada")
    await expect(declined.getByTestId("declined-stamp")).toBeVisible()
  })

  test("excluir vaga: confirmação digitando o job_id, some da planilha e volta para a lista", async ({ page }) => {
    // The fake answers like job-search but cannot change the fixture Sheet (fake-1002 answers DELETE_PARTIAL).
    await page.goto("/vaga/fake-1004")
    await page.getByTestId("delete-job").click()
    const dialog = page.getByTestId("delete-job-dialog")
    await expect(dialog).toContainText("backup local")
    await expect(dialog).toContainText("Descartar vaga")
    await expect(dialog).toContainText("Não dá para desfazer")
    const input = page.getByTestId("delete-job-input")
    const confirm = page.getByTestId("delete-job-confirm")
    await expect(confirm).toBeDisabled()
    await input.fill("fake-100")
    await expect(confirm).toBeDisabled()
    await page.getByTestId("delete-job-cancel").click()
    await expect(dialog).toBeHidden()
    await page.getByTestId("delete-job").click()
    await expect(input).toHaveValue("")
    await input.fill("fake-1004")
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByText("Vaga excluída da planilha")).toBeVisible()
    await expect(page).toHaveURL(/\/vagas$/)

    // A partial delete is never shown as success: the user stays on the job to sync and retry.
    await page.goto("/vaga/fake-1002")
    await page.getByTestId("delete-job").click()
    await page.getByTestId("delete-job-input").fill("fake-1002")
    await page.getByTestId("delete-job-confirm").click()
    await expect(page.getByText("Exclusão parcial")).toBeVisible()
    await expect(page).toHaveURL(/\/vaga\/fake-1002$/)

    // A discarded job can be deleted (and not discarded again); sent, uncertain and archive-only rows cannot.
    await page.goto("/vaga/fake-1009")
    await expect(page.getByTestId("delete-job")).toBeVisible()
    await expect(page.getByTestId("decline-job")).toHaveCount(0)
    for (const id of ["fake-1006", "fake-1007", "fake-0999"]) {
      await page.goto(`/vaga/${id}`)
      await expect(page.getByTestId("job-detail")).toBeVisible()
      await expect(page.getByTestId("delete-job")).toHaveCount(0)
    }
  })
})
