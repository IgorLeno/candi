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

  test("vaga indicada: não localizada pede mais contexto; descarte só no painel", async ({ page }) => {
    // The fake advances one stage per poll (5 s).
    test.setTimeout(90_000)
    await page.goto("/vagas")
    const ops = page.getByTestId("search-ops")
    await ops.getByTestId("intake-button").click()
    await page.getByTestId("intake-input").fill("Estágio na nao-existe S.A., cargo que ninguém anunciou")
    await page.getByTestId("intake-confirm").click()
    const missing = ops.getByTestId("dispatch-LOCALIZAR_VAGA")
    await expect(missing).toHaveAttribute("data-status", "PRECISA_HUMANO", { timeout: 30_000 })
    await expect(missing.getByTestId("intake-reason")).toContainText("Indique de novo com mais detalhe")
    await expect(missing.locator('[data-stage="localizar"]')).toHaveAttribute("data-state", "failed")
    await expect(missing).toContainText("NEEDS_CONTEXT")
    await expect(missing.getByTestId("intake-analyze")).toHaveCount(0)

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
    await expect(page.getByTestId("dispatch-dialog")).toContainText("Nada é enviado")
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
})
