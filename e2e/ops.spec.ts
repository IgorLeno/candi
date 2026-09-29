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
