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

  test("buscar vagas: confirmação, progresso por etapa e registro detectado na planilha", async ({ page }) => {
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

    // The fake finishes the dispatcher's part; the writeset jobs (fake-1001, fake-1002) are already in the
    // fixture Sheet, so the panel closes the last stage itself.
    await expect(card).toHaveAttribute("data-status", "CONCLUIDO", { timeout: 30_000 })
    await expect(card.locator('[data-stage="registro"]')).toHaveAttribute("data-state", "done")
    await expect(card).toContainText("2 de 2 na planilha")
    await expect(card).toContainText("100%")
    await expect(card.getByTestId("writeset-pending")).toContainText("writeset.py persist")

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
